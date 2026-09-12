import moment from 'moment-timezone';
import { db } from '../db';
import { getUserBadges } from './badges';
import { Locale } from '../i18n';

const TIMEZONE = 'Asia/Taipei';

export type LeaderboardPeriod = 'week' | 'month' | 'quarter' | 'year' | 'all';
const LEADERBOARD_CACHE_TTL_MS = 30 * 1000;
const leaderboardCache = new Map<LeaderboardPeriod, { data: Awaited<ReturnType<typeof loadLeaderboard>>; expiresAt: number }>();
const leaderboardRequests = new Map<LeaderboardPeriod, Promise<Awaited<ReturnType<typeof loadLeaderboard>>>>();

export interface UserStats {
    totalCheckins: number;
    currentStreak: number;
    longestStreak: number;
    lastCheckinDate: string | null;
}

export const getLevelTitle = (totalCheckins: number, locale: Locale = 'zh_TW') => {
    const titles = locale === 'en'
        ? ['Qi Cultivation (Level 1)', 'Foundation Building (Level 2)', 'Inner Formation (Level 3)', 'Transformation (Level 4)']
        : locale === 'zh_CN'
            ? ['练气 (Level 1)', '筑基 (Level 2)', '结丹 (Level 3)', '化境 (Level 4)']
            : ['練氣 (Level 1)', '築基 (Level 2)', '結丹 (Level 3)', '化境 (Level 4)'];
    if (totalCheckins >= 200) return titles[3];
    if (totalCheckins >= 90) return titles[2];
    if (totalCheckins >= 30) return titles[1];
    return titles[0];
};

interface PeriodRange {
    start: Date;
    end: Date;
}

export interface AdminPeriodRange extends PeriodRange {
    anchorDate: string;
    startDate: string;
    endDate: string;
    previousDate: string;
    nextDate: string;
}

export const getAdminPeriodRange = (period: Exclude<LeaderboardPeriod, 'all'>, anchorDate?: string): AdminPeriodRange => {
    const anchor = anchorDate
        ? moment.tz(anchorDate, 'YYYY-MM-DD', true, TIMEZONE)
        : moment().tz(TIMEZONE);
    if (!anchor.isValid()) throw new Error('Invalid date. Use YYYY-MM-DD.');

    let start: moment.Moment;
    let end: moment.Moment;
    switch (period) {
        case 'week':
            start = anchor.clone().startOf('isoWeek');
            end = start.clone().add(1, 'week');
            break;
        case 'month':
            start = anchor.clone().startOf('month');
            end = start.clone().add(1, 'month');
            break;
        case 'quarter':
            start = anchor.clone().startOf('quarter');
            end = start.clone().add(1, 'quarter');
            break;
        case 'year':
            start = anchor.clone().startOf('year');
            end = start.clone().add(1, 'year');
            break;
    }

    return {
        start: start.toDate(),
        end: end.toDate(),
        anchorDate: anchor.format('YYYY-MM-DD'),
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.clone().subtract(1, 'day').format('YYYY-MM-DD'),
        previousDate: start.clone().subtract(1, 'day').format('YYYY-MM-DD'),
        nextDate: end.format('YYYY-MM-DD')
    };
};

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

export const getUserStats = async (telegramUserId: number, practiceTimezone = TIMEZONE): Promise<UserStats> => {
    const { rows } = await db.query(
        `SELECT checkin_date
         FROM telegram_checkin_logs
         WHERE telegram_user_id = $1
         ORDER BY checkin_date ASC`,
        [telegramUserId]
    );

    const dates = rows.map((r) => moment.tz(r.checkin_date, 'YYYY-MM-DD', practiceTimezone));
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

    const today = moment().tz(practiceTimezone).startOf('day');
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

const loadLeaderboard = async (period: LeaderboardPeriod) => {
    const range = getPeriodRange(period);
    const rangeParams = range
        ? [
            moment(range.start).tz(TIMEZONE).format('YYYY-MM-DD'),
            moment(range.end).tz(TIMEZONE).format('YYYY-MM-DD')
        ]
        : [];

    const totalsQuery = range
        ? `SELECT u.telegram_user_id, u.username, u.first_name, u.last_name, COUNT(*) AS total_days
           FROM telegram_checkin_logs l
           JOIN telegram_users u ON u.telegram_user_id = l.telegram_user_id
           WHERE l.checkin_date >= $1::date AND l.checkin_date < $2::date
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
        ? (await db.query(totalsQuery, rangeParams)).rows
        : (await db.query(totalsQuery)).rows;

    const streaksQuery = range
        ? `SELECT l.telegram_user_id, u.username, u.first_name, u.last_name, l.checkin_date
           FROM telegram_checkin_logs l
           JOIN telegram_users u ON u.telegram_user_id = l.telegram_user_id
           WHERE l.checkin_date >= $1::date AND l.checkin_date < $2::date
           ORDER BY l.telegram_user_id ASC, l.checkin_date ASC`
        : `SELECT l.telegram_user_id, u.username, u.first_name, u.last_name, l.checkin_date
           FROM telegram_checkin_logs l
           JOIN telegram_users u ON u.telegram_user_id = l.telegram_user_id
           ORDER BY l.telegram_user_id ASC, l.checkin_date ASC`;

    const streakRows = range
        ? (await db.query(streaksQuery, rangeParams)).rows
        : (await db.query(streaksQuery)).rows;

    const userStreaks = new Map<number, { telegramUserId: number; displayName: string; maxStreak: number }>();
    let currentUserId: number | null = null;
    let currentDisplayName = '';
    let currentStreak = 0;
    let maxStreak = 0;
    let lastDate: moment.Moment | null = null;

    const flush = () => {
        if (currentUserId !== null) {
            userStreaks.set(currentUserId, { telegramUserId: currentUserId, displayName: currentDisplayName, maxStreak });
        }
    };

    for (const row of streakRows) {
        const rowUserId = Number(row.telegram_user_id);
        if (rowUserId !== currentUserId) {
            flush();
            currentUserId = rowUserId;
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
        telegramUserId: Number(row.telegram_user_id),
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

export const getLeaderboard = async (period: LeaderboardPeriod) => {
    const cached = leaderboardCache.get(period);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    if (cached) leaderboardCache.delete(period);

    const existingRequest = leaderboardRequests.get(period);
    if (existingRequest) return existingRequest;

    const request = loadLeaderboard(period)
        .then((data) => {
            leaderboardCache.set(period, { data, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL_MS });
            return data;
        })
        .finally(() => leaderboardRequests.delete(period));
    leaderboardRequests.set(period, request);
    return request;
};

export const invalidateLeaderboardCache = () => {
    leaderboardCache.clear();
    leaderboardRequests.clear();
};

export const getOverviewStats = async (period: Exclude<LeaderboardPeriod, 'all'>, anchorDate?: string) => {
    const range = getAdminPeriodRange(period, anchorDate);
    const { startDate, endDate } = range;
    const endDateExclusive = moment.tz(endDate, 'YYYY-MM-DD', TIMEZONE).add(1, 'day').format('YYYY-MM-DD');

    const kpiQuery = `
        SELECT 
            COUNT(DISTINCT telegram_user_id) AS active_users,
            COUNT(*) AS total_checkins
        FROM telegram_checkin_logs
        WHERE checkin_date >= $1::date AND checkin_date < $2::date
    `;
    const kpiRes = await db.query(kpiQuery, [startDate, endDateExclusive]);

    const activeUsers = parseInt(kpiRes.rows[0]?.active_users || '0', 10);
    const totalCheckins = parseInt(kpiRes.rows[0]?.total_checkins || '0', 10);
    const daysInPeriod = moment.tz(endDateExclusive, 'YYYY-MM-DD', TIMEZONE).diff(moment.tz(startDate, 'YYYY-MM-DD', TIMEZONE), 'days') || 1;
    const avgDailyCheckins = Number((totalCheckins / daysInPeriod).toFixed(1));

    const trendQuery = `
        SELECT checkin_date::text AS checkin_date, COUNT(*) AS daily_count
        FROM telegram_checkin_logs
        WHERE checkin_date >= $1::date AND checkin_date < $2::date
        GROUP BY checkin_date
        ORDER BY checkin_date ASC
    `;
    const trendRes = await db.query(trendQuery, [startDate, endDateExclusive]);

    const trendMap = new Map<string, number>();
    trendRes.rows.forEach((row) => {
        trendMap.set(row.checkin_date, parseInt(row.daily_count, 10));
    });

    const trend: Array<{ date: string; count: number }> = [];
    let curr = moment.tz(startDate, 'YYYY-MM-DD', TIMEZONE);
    const stop = moment.tz(endDate, 'YYYY-MM-DD', TIMEZONE);
    while (curr <= stop) {
        const key = curr.format('YYYY-MM-DD');
        trend.push({ date: key, count: trendMap.get(key) || 0 });
        curr.add(1, 'day');
    }

    return {
        range: {
            anchorDate: range.anchorDate,
            startDate: range.startDate,
            endDate: range.endDate,
            previousDate: range.previousDate,
            nextDate: range.nextDate
        },
        kpis: { activeUsers, totalCheckins, avgDailyCheckins },
        trend
    };
};

export interface TodayCheckinUser {
    telegramUserId: number;
    displayName: string;
}

export interface TodayCheckinPage {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    date: string;
    isToday: boolean;
    users: TodayCheckinUser[];
}

const getTodayDateStr = () => moment().tz(TIMEZONE).format('YYYY-MM-DD');

export const getCheckedInUsersByDate = async (date: string, page = 1, limit = 20): Promise<TodayCheckinPage> => {
    const offset = (page - 1) * limit;

    const countRes = await db.query(
        `SELECT COUNT(DISTINCT telegram_user_id) AS total
         FROM telegram_checkin_logs
         WHERE checkin_date = $1`,
        [date]
    );
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    const { rows } = await db.query(
        `SELECT u.telegram_user_id, u.first_name, u.last_name, u.username
         FROM telegram_users u
         JOIN telegram_checkin_logs l ON l.telegram_user_id = u.telegram_user_id
         WHERE l.checkin_date = $1
         GROUP BY u.telegram_user_id, u.first_name, u.last_name, u.username
         ORDER BY MAX(l.created_at) DESC
         LIMIT $2 OFFSET $3`,
        [date, limit, offset]
    );

    return {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        date,
        isToday: date === getTodayDateStr(),
        users: rows.map((row) => ({
            telegramUserId: Number(row.telegram_user_id),
            displayName: getDisplayName(row)
        }))
    };
};

export const getPendingUsersByDate = async (date: string, page = 1, limit = 20): Promise<TodayCheckinPage> => {
    const offset = (page - 1) * limit;

    const countRes = await db.query(
        `SELECT COUNT(*) AS total
         FROM telegram_users u
         WHERE NOT EXISTS (
              SELECT 1 FROM telegram_checkin_logs l
              WHERE l.telegram_user_id = u.telegram_user_id AND l.checkin_date = $1
          )
            AND (u.created_at AT TIME ZONE $2)::date <= $1::date`,
        [date, TIMEZONE]
    );
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    const { rows } = await db.query(
        `SELECT u.telegram_user_id, u.first_name, u.last_name, u.username
         FROM telegram_users u
         WHERE NOT EXISTS (
              SELECT 1 FROM telegram_checkin_logs l
              WHERE l.telegram_user_id = u.telegram_user_id AND l.checkin_date = $1
          )
            AND (u.created_at AT TIME ZONE $2)::date <= $1::date
          ORDER BY u.first_name ASC, u.telegram_user_id ASC
          LIMIT $3 OFFSET $4`,
        [date, TIMEZONE, limit, offset]
    );

    return {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        date,
        isToday: date === getTodayDateStr(),
        users: rows.map((row) => ({
            telegramUserId: Number(row.telegram_user_id),
            displayName: getDisplayName(row)
        }))
    };
};

export const getTodayCheckedInUsers = (page = 1, limit = 20) => getCheckedInUsersByDate(getTodayDateStr(), page, limit);
export const getTodayPendingUsers = (page = 1, limit = 20) => getPendingUsersByDate(getTodayDateStr(), page, limit);

export interface AdminLifetimeLeaderboardRow {
    telegramUserId: number;
    displayName: string;
    totalDays: number;
    currentStreak: number;
    lastCheckinDate: string | null;
}

export interface AdminLifetimeLeaderboardPage {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    rows: AdminLifetimeLeaderboardRow[];
}

export const getAdminLifetimeLeaderboard = async (page = 1, limit = 20): Promise<AdminLifetimeLeaderboardPage> => {
    const offset = (page - 1) * limit;
    const countRes = await db.query('SELECT COUNT(*) AS total FROM telegram_users');
    const total = parseInt(countRes.rows[0]?.total || '0', 10);
    const { rows } = await db.query(
        `WITH numbered_dates AS (
             SELECT telegram_user_id,
                    checkin_date,
                    checkin_date - ROW_NUMBER() OVER (PARTITION BY telegram_user_id ORDER BY checkin_date)::int AS island
             FROM telegram_checkin_logs
         ),
         streak_runs AS (
             SELECT telegram_user_id, island, COUNT(*)::int AS streak_days, MAX(checkin_date) AS run_end
             FROM numbered_dates
             GROUP BY telegram_user_id, island
         ),
         latest_runs AS (
             SELECT DISTINCT ON (telegram_user_id) telegram_user_id, streak_days, run_end
             FROM streak_runs
             ORDER BY telegram_user_id, run_end DESC
         ),
         totals AS (
             SELECT telegram_user_id, COUNT(*)::int AS total_days, MAX(checkin_date) AS last_checkin_date
             FROM telegram_checkin_logs
             GROUP BY telegram_user_id
         )
         SELECT u.telegram_user_id, u.username, u.first_name, u.last_name,
                COALESCE(t.total_days, 0) AS total_days,
                CASE
                    WHEN lr.run_end >= ((CURRENT_TIMESTAMP AT TIME ZONE $3)::date - 1) THEN lr.streak_days
                    ELSE 0
                END AS current_streak,
                t.last_checkin_date::text AS last_checkin_date
         FROM telegram_users u
         LEFT JOIN totals t ON t.telegram_user_id = u.telegram_user_id
         LEFT JOIN latest_runs lr ON lr.telegram_user_id = u.telegram_user_id
         ORDER BY COALESCE(t.total_days, 0) DESC,
                  CASE
                      WHEN lr.run_end >= ((CURRENT_TIMESTAMP AT TIME ZONE $3)::date - 1) THEN lr.streak_days
                      ELSE 0
                  END DESC,
                  u.first_name ASC NULLS LAST, u.telegram_user_id ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset, TIMEZONE]
    );

    return {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        rows: rows.map((row) => ({
            telegramUserId: Number(row.telegram_user_id),
            displayName: getDisplayName(row),
            totalDays: Number(row.total_days || 0),
            currentStreak: Number(row.current_streak || 0),
            lastCheckinDate: row.last_checkin_date || null
        }))
    };
};

export type AdminLeaderboardLimit = 10 | 20 | 30;

export const getAdminPeriodStreaks = async (
    period: Exclude<LeaderboardPeriod, 'all'>,
    limit: AdminLeaderboardLimit = 10
) => {
    const { startDate, endDate } = getAdminPeriodRange(period);
    const endDateExclusive = moment.tz(endDate, 'YYYY-MM-DD', TIMEZONE).add(1, 'day').format('YYYY-MM-DD');
    const { rows } = await db.query(
        `WITH numbered_dates AS (
             SELECT telegram_user_id,
                    checkin_date,
                    checkin_date - ROW_NUMBER() OVER (PARTITION BY telegram_user_id ORDER BY checkin_date)::int AS island
             FROM telegram_checkin_logs
             WHERE checkin_date >= $1::date AND checkin_date < $2::date
         ),
         streak_runs AS (
             SELECT telegram_user_id, island, COUNT(*)::int AS streak_days
             FROM numbered_dates
             GROUP BY telegram_user_id, island
         ),
         max_streaks AS (
             SELECT telegram_user_id, MAX(streak_days)::int AS max_streak
             FROM streak_runs
             GROUP BY telegram_user_id
         )
         SELECT m.telegram_user_id, u.username, u.first_name, u.last_name, m.max_streak
         FROM max_streaks m
         JOIN telegram_users u ON u.telegram_user_id = m.telegram_user_id
         ORDER BY m.max_streak DESC, u.first_name ASC NULLS LAST, m.telegram_user_id ASC
         LIMIT $3`,
        [startDate, endDateExclusive, limit]
    );
    return rows.map((row) => ({
        telegramUserId: Number(row.telegram_user_id),
        displayName: getDisplayName(row),
        maxStreak: Number(row.max_streak || 0)
    }));
};

export const buildUserStatsMessage = (stats: UserStats, locale: Locale = 'zh_TW') => {
    if (locale === 'en') {
        if (stats.totalCheckins === 0) return 'You have no check-ins yet. Use /checkin to begin today’s practice!';
        return `📊 Your practice stats\n\n🔥 Current streak: ${stats.currentStreak} days\n📈 Longest streak: ${stats.longestStreak} days\n⭐ Total check-ins: ${stats.totalCheckins} days\n🗓 Most recent: ${stats.lastCheckinDate}`;
    }
    if (locale === 'zh_CN') {
        if (stats.totalCheckins === 0) return '你目前还没有打卡记录，先用 /checkin 开始今天的练功吧！';
        return `📊 你的练功统计\n\n🔥 目前连续打卡：${stats.currentStreak} 天\n📈 最长连续打卡：${stats.longestStreak} 天\n⭐ 总打卡天数：${stats.totalCheckins} 天\n🗓 最近打卡日期：${stats.lastCheckinDate}`;
    }
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

export const buildEnhancedUserStatsMessage = async (telegramUserId: number, stats: UserStats, locale: Locale = 'zh_TW') => {
    if (stats.totalCheckins === 0) {
        return buildUserStatsMessage(stats, locale);
    }

    const badges = await getUserBadges(telegramUserId, locale);
    const levelTitle = getLevelTitle(stats.totalCheckins, locale);
    let trophy = locale === 'en' ? 'No badges yet. Keep checking in to unlock one!' : locale === 'zh_CN' ? '目前还没有勋章，快去打卡解锁吧！' : '目前還沒有勳章，快去打卡解鎖吧！';

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

    if (locale === 'en') return [
        '📊 Your practice progress', '', `【Current level】${levelTitle}`,
        `🔥 Current streak: ${stats.currentStreak} days`, `📈 Longest streak: ${stats.longestStreak} days`,
        `⭐ Total check-ins: ${stats.totalCheckins} days`, `🗓 Most recent: ${stats.lastCheckinDate}`, '', '🏆 Your badges:', trophy
    ].join('\n');
    if (locale === 'zh_CN') return [
        '📊 你的练功数据', '', `【当前境界】${levelTitle}`,
        `🔥 目前连续打卡：${stats.currentStreak} 天`, `📈 最长连续打卡：${stats.longestStreak} 天`,
        `⭐ 总打卡天数：${stats.totalCheckins} 天`, `🗓 最近打卡日期：${stats.lastCheckinDate}`, '', '🏆 你的荣誉勋章：', trophy
    ].join('\n');
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

export const buildBadgesMessage = async (telegramUserId: number, locale: Locale = 'zh_TW') => {
    const badges = await getUserBadges(telegramUserId, locale);
    if (badges.length === 0) {
        return locale === 'en' ? '🏆 You have not unlocked any badges yet. Keep checking in!' : locale === 'zh_CN' ? '🏆 你目前还没有解锁任何勋章，持续打卡很快就会有第一枚成就！' : '🏆 你目前還沒有解鎖任何勳章，持續打卡很快就會有第一枚成就！';
    }

    let msg = locale === 'en' ? '🏆 Your achievement badges\n\n' : locale === 'zh_CN' ? '🏆 你的成就勋章\n\n' : '🏆 你的成就勳章\n\n';
    badges.forEach((badge, index) => {
        const yearText = badge.earned_year && badge.earned_year !== 0 ? `（${badge.earned_year}）` : '';
        msg += `${index + 1}. ${badge.emoji || '🏅'} ${badge.name}${yearText}\n   ${badge.description || ''}\n`;
    });
    return msg.trim();
};

export const buildLeaderboardMessage = async (period: LeaderboardPeriod, locale: Locale = 'zh_TW') => {
    const titleSets: Record<Locale, Record<LeaderboardPeriod, string>> = {
        en: { week: '🏆 Weekly Leaderboard', month: '🏆 Monthly Leaderboard', quarter: '🏆 Quarterly Leaderboard', year: '🏆 Yearly Leaderboard', all: '🏆 All-Time Leaderboard' },
        zh_CN: { week: '🏆 周排行榜', month: '🏆 月排行榜', quarter: '🏆 季排行榜', year: '🏆 年排行榜', all: '🏆 总排行榜' },
        zh_TW: {
        week: '🏆 週排行榜',
        month: '🏆 月排行榜',
        quarter: '🏆 季排行榜',
        year: '🏆 年排行榜',
        all: '🏆 總排行榜' }
    };
    const titles = titleSets[locale];

    const { totals, streaks } = await getLeaderboard(period);

    if (totals.length === 0 && streaks.length === 0) {
        return `${titles[period]}\n\n${locale === 'en' ? 'No check-ins yet.' : locale === 'zh_CN' ? '目前还没有打卡记录。' : '目前還沒有打卡紀錄。'}`;
    }

    const day = locale === 'en' ? ' days' : '天';
    let msg = `${titles[period]}\n\n${locale === 'en' ? '⭐ Total Check-in Days Top 10' : locale === 'zh_CN' ? '⭐ 总打卡天数 Top 10' : '⭐ 總打卡天數 Top 10'}\n`;
    totals.forEach((row, i) => {
        msg += `${i + 1}. ${row.displayName} (${row.totalDays}${day})\n`;
    });

    msg += `\n${locale === 'en' ? '🔥 Longest Streak Top 10' : locale === 'zh_CN' ? '🔥 最长连续打卡 Top 10' : '🔥 最長連續打卡 Top 10'}\n`;
    streaks.forEach((row, i) => {
        msg += `${i + 1}. ${row.displayName} (${locale === 'en' ? `${row.maxStreak} consecutive days` : `${locale === 'zh_CN' ? '连续' : '連續'}${row.maxStreak}天`})\n`;
    });

    return msg.trim();
};
