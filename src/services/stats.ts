import moment from 'moment-timezone';
import { db } from '../db';
import { getUserBadges } from './badges';

const TIMEZONE = 'Asia/Taipei';

export type LeaderboardPeriod = 'week' | 'month' | 'quarter' | 'year' | 'all';

export interface UserStats {
    totalCheckins: number;
    currentStreak: number;
    longestStreak: number;
    lastCheckinDate: string | null;
}

export const getLevelTitle = (totalCheckins: number) => {
    if (totalCheckins >= 200) return '化境 (Level 4)';
    if (totalCheckins >= 90) return '結丹 (Level 3)';
    if (totalCheckins >= 30) return '築基 (Level 2)';
    return '練氣 (Level 1)';
};

interface PeriodRange {
    start: Date;
    end: Date;
}

const getPeriodRange = (period: LeaderboardPeriod): PeriodRange | null => {
    const now = moment().tz(TIMEZONE);
    switch (period) {
        case 'week':
            return { start: now.clone().startOf('isoWeek').toDate(), end: now.clone().endOf('isoWeek').add(1, 'millisecond').toDate() };
        case 'month':
            return { start: now.clone().startOf('month').toDate(), end: now.clone().endOf('month').add(1, 'millisecond').toDate() };
        case 'quarter':
            return { start: now.clone().startOf('quarter').toDate(), end: now.clone().endOf('quarter').add(1, 'millisecond').toDate() };
        case 'year':
            return { start: now.clone().startOf('year').toDate(), end: now.clone().endOf('year').add(1, 'millisecond').toDate() };
        case 'all':
        default:
            return null;
    }
};

const getDisplayName = (row: { first_name?: string | null; last_name?: string | null; username?: string | null }) => {
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
    if (fullName) return fullName;
    if (row.username) return `@${row.username}`;
    return 'Unknown';
};

export const getUserStats = async (telegramUserId: number): Promise<UserStats> => {
    const { rows } = await db.query(
        `SELECT checkin_date
         FROM telegram_checkin_logs
         WHERE telegram_user_id = $1
         ORDER BY checkin_date ASC`,
        [telegramUserId]
    );

    const dates = rows.map((r) => moment.tz(r.checkin_date, 'YYYY-MM-DD', TIMEZONE));
    if (dates.length === 0) {
        return {
            totalCheckins: 0,
            currentStreak: 0,
            longestStreak: 0,
            lastCheckinDate: null
        };
    }

    let longestStreak = 1;
    let runningStreak = 1;
    for (let i = 1; i < dates.length; i++) {
        if (dates[i].diff(dates[i - 1], 'days') === 1) {
            runningStreak += 1;
            if (runningStreak > longestStreak) longestStreak = runningStreak;
        } else {
            runningStreak = 1;
        }
    }

    const today = moment().tz(TIMEZONE).startOf('day');
    const yesterday = today.clone().subtract(1, 'day');
    let currentStreak = 0;
    let cursor = dates.length - 1;

    if (dates[cursor].isSame(today, 'day') || dates[cursor].isSame(yesterday, 'day')) {
        currentStreak = 1;
        while (cursor > 0 && dates[cursor].diff(dates[cursor - 1], 'days') === 1) {
            currentStreak += 1;
            cursor -= 1;
        }
    }

    return {
        totalCheckins: dates.length,
        currentStreak,
        longestStreak,
        lastCheckinDate: dates[dates.length - 1].format('YYYY-MM-DD')
    };
};

export const getLeaderboard = async (period: LeaderboardPeriod) => {
    const range = getPeriodRange(period);

    const totalsQuery = range
        ? `SELECT u.telegram_user_id, u.username, u.first_name, u.last_name, COUNT(*) AS total_days
           FROM telegram_checkin_logs l
           JOIN telegram_users u ON u.telegram_user_id = l.telegram_user_id
           WHERE l.created_at >= $1 AND l.created_at < $2
           GROUP BY u.telegram_user_id, u.username, u.first_name, u.last_name
           ORDER BY total_days DESC, u.first_name ASC
           LIMIT 10`
        : `SELECT u.telegram_user_id, u.username, u.first_name, u.last_name, COUNT(*) AS total_days
           FROM telegram_checkin_logs l
           JOIN telegram_users u ON u.telegram_user_id = l.telegram_user_id
           GROUP BY u.telegram_user_id, u.username, u.first_name, u.last_name
           ORDER BY total_days DESC, u.first_name ASC
           LIMIT 10`;

    const totalsRows = range
        ? (await db.query(totalsQuery, [range.start, range.end])).rows
        : (await db.query(totalsQuery)).rows;

    const streaksQuery = range
        ? `SELECT l.telegram_user_id, u.username, u.first_name, u.last_name, l.checkin_date
           FROM telegram_checkin_logs l
           JOIN telegram_users u ON u.telegram_user_id = l.telegram_user_id
           WHERE l.created_at >= $1 AND l.created_at < $2
           ORDER BY l.telegram_user_id ASC, l.checkin_date ASC`
        : `SELECT l.telegram_user_id, u.username, u.first_name, u.last_name, l.checkin_date
           FROM telegram_checkin_logs l
           JOIN telegram_users u ON u.telegram_user_id = l.telegram_user_id
           ORDER BY l.telegram_user_id ASC, l.checkin_date ASC`;

    const streakRows = range
        ? (await db.query(streaksQuery, [range.start, range.end])).rows
        : (await db.query(streaksQuery)).rows;

    const userStreaks = new Map<number, { displayName: string; maxStreak: number }>();
    let currentUserId: number | null = null;
    let currentDisplayName = '';
    let currentStreak = 0;
    let maxStreak = 0;
    let lastDate: moment.Moment | null = null;

    const flush = () => {
        if (currentUserId !== null) {
            userStreaks.set(currentUserId, { displayName: currentDisplayName, maxStreak });
        }
    };

    for (const row of streakRows) {
        if (row.telegram_user_id !== currentUserId) {
            flush();
            currentUserId = row.telegram_user_id;
            currentDisplayName = getDisplayName(row);
            currentStreak = 1;
            maxStreak = 1;
            lastDate = moment.tz(row.checkin_date, 'YYYY-MM-DD', TIMEZONE);
            continue;
        }

        const date = moment.tz(row.checkin_date, 'YYYY-MM-DD', TIMEZONE);
        if (lastDate && date.diff(lastDate, 'days') === 1) {
            currentStreak += 1;
            if (currentStreak > maxStreak) maxStreak = currentStreak;
        } else {
            currentStreak = 1;
        }
        lastDate = date;
    }
    flush();

    const totals = totalsRows.map((row) => ({
        displayName: getDisplayName(row),
        totalDays: parseInt(row.total_days, 10)
    }));

    const streaks = [...userStreaks.values()]
        .sort((a, b) => {
            if (b.maxStreak !== a.maxStreak) return b.maxStreak - a.maxStreak;
            return a.displayName.localeCompare(b.displayName);
        })
        .slice(0, 10);

    return { totals, streaks };
};

export const buildUserStatsMessage = (stats: UserStats) => {
    if (stats.totalCheckins === 0) {
        return '你目前還沒有打卡紀錄，先用 /checkin 開始今天的練功吧！';
    }

    return [
        '📊 你的練功統計',
        '',
        `🔥 目前連續打卡：${stats.currentStreak} 天`,
        `📈 最長連續打卡：${stats.longestStreak} 天`,
        `⭐ 總打卡天數：${stats.totalCheckins} 天`,
        `🗓 最近打卡日期：${stats.lastCheckinDate}`
    ].join('\n');
};

export const buildEnhancedUserStatsMessage = async (telegramUserId: number, stats: UserStats) => {
    if (stats.totalCheckins === 0) {
        return '你目前還沒有打卡紀錄，先用 /checkin 開始今天的練功吧！';
    }

    const badges = await getUserBadges(telegramUserId);
    const levelTitle = getLevelTitle(stats.totalCheckins);
    let trophy = '目前還沒有勳章，快去打卡解鎖吧！';

    if (badges.length > 0) {
        const grouped = new Map<string, { emoji: string; years: number[]; count: number }>();
        for (const badge of badges) {
            if (!grouped.has(badge.name)) {
                grouped.set(badge.name, { emoji: badge.emoji || '', years: [], count: 0 });
            }
            const item = grouped.get(badge.name)!;
            item.count += 1;
            if (badge.earned_year && badge.earned_year !== 0) item.years.push(badge.earned_year);
        }
        trophy = [...grouped.entries()].map(([name, item]) => {
            const countText = item.count > 1 ? ` x${item.count}` : '';
            const yearText = item.years.length > 0 ? ` [${item.years.join(', ')}]` : '';
            return `${item.emoji} ${name}${countText}${yearText}`;
        }).join('\n');
    }

    return [
        '📊 你的修練數據',
        '',
        `【當前境界】${levelTitle}`,
        `🔥 目前連續打卡：${stats.currentStreak} 天`,
        `📈 最長連續打卡：${stats.longestStreak} 天`,
        `⭐ 總打卡天數：${stats.totalCheckins} 天`,
        `🗓 最近打卡日期：${stats.lastCheckinDate}`,
        '',
        '🏆 你的榮譽勳章：',
        trophy
    ].join('\n');
};

export const buildBadgesMessage = async (telegramUserId: number) => {
    const badges = await getUserBadges(telegramUserId);
    if (badges.length === 0) {
        return '🏆 你目前還沒有解鎖任何勳章，持續打卡很快就會有第一枚成就！';
    }

    let msg = '🏆 你的成就勳章\n\n';
    badges.forEach((badge, index) => {
        const yearText = badge.earned_year && badge.earned_year !== 0 ? `（${badge.earned_year}）` : '';
        msg += `${index + 1}. ${badge.emoji || '🏅'} ${badge.name}${yearText}\n   ${badge.description || ''}\n`;
    });
    return msg.trim();
};

export const buildLeaderboardMessage = async (period: LeaderboardPeriod) => {
    const titles: Record<LeaderboardPeriod, string> = {
        week: '🏆 週排行榜',
        month: '🏆 月排行榜',
        quarter: '🏆 季排行榜',
        year: '🏆 年排行榜',
        all: '🏆 總排行榜'
    };

    const { totals, streaks } = await getLeaderboard(period);

    if (totals.length === 0 && streaks.length === 0) {
        return `${titles[period]}\n\n目前還沒有打卡紀錄。`;
    }

    let msg = `${titles[period]}\n\n⭐ 總打卡天數 Top 10\n`;
    totals.forEach((row, i) => {
        msg += `${i + 1}. ${row.displayName}（${row.totalDays}天）\n`;
    });

    msg += '\n🔥 最長連續打卡 Top 10\n';
    streaks.forEach((row, i) => {
        msg += `${i + 1}. ${row.displayName}（連續${row.maxStreak}天）\n`;
    });

    return msg.trim();
};
