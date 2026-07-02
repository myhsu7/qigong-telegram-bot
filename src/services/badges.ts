import moment from 'moment-timezone';
import { Lunar } from 'lunar-javascript';
import { db } from '../db';
import { getUserStats } from './stats';
import { getMethodTaxonomy } from './taxonomy';

const TIMEZONE = 'Asia/Taipei';

const WINTER_GUISHOU_CODES = ['guishou_bagua', 'guishou_qiankun', 'guishou_fengxiang_guishuo'] as const;
const WINTER_GUISHOU_NOTE_PATTERNS = ['%龜壽功%', '%八卦功%', '%乾坤功%', '%鳳翔與龜縮%'];
const COMBO_BADGES = [
    { badgeId: 'combo_dayan', parentCode: 'dayan' },
    { badgeId: 'combo_wuqinxi', parentCode: 'wuqinxi' },
    { badgeId: 'combo_huichun', parentCode: 'huichun' },
    { badgeId: 'combo_guishou', parentCode: 'guishou' },
    { badgeId: 'combo_zhengyang', parentCode: 'zhengyang' },
    { badgeId: 'combo_jinggong', parentCode: 'jinggong' }
] as const;

export interface UnlockedBadge {
    badgeId: string;
    name: string;
    emoji: string;
    description: string;
    earnedYear: number;
}

export interface GroupedBadge {
    emoji: string;
    name: string;
    count: number;
    years: number[];
}

const hasBadge = async (telegramUserId: number, badgeId: string, earnedYear: number) => {
    const { rows } = await db.query(
        `SELECT 1 FROM telegram_user_badges WHERE telegram_user_id = $1 AND badge_id = $2 AND earned_year = $3`,
        [telegramUserId, badgeId, earnedYear]
    );
    return rows.length > 0;
};

const awardBadge = async (telegramUserId: number, badgeId: string, earnedYear: number): Promise<UnlockedBadge | null> => {
    if (await hasBadge(telegramUserId, badgeId, earnedYear)) return null;

    await db.query(
        `INSERT INTO telegram_user_badges (telegram_user_id, badge_id, earned_year) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [telegramUserId, badgeId, earnedYear]
    );

    const { rows } = await db.query(
        `SELECT id, name, emoji, description FROM telegram_badges WHERE id = $1`,
        [badgeId]
    );
    if (rows.length === 0) return null;

    return {
        badgeId: rows[0].id,
        name: rows[0].name,
        emoji: rows[0].emoji || '',
        description: rows[0].description || '',
        earnedYear
    };
};

const getJieQiDateStr = (year: number, jieQiName: string): string | null => {
    const lunar = Lunar.fromDate(new Date(year, 6, 1));
    const jieQi = lunar.getJieQiTable()[jieQiName];
    return jieQi ? jieQi.toYmd() : null;
};

export const evaluateTelegramBadges = async (telegramUserId: number, selectedMethodCodes: string[]): Promise<UnlockedBadge[]> => {
    const unlocked: UnlockedBadge[] = [];
    const stats = await getUserStats(telegramUserId);
    const now = moment().tz(TIMEZONE);
    const currentYear = now.year();
    const taxonomy = selectedMethodCodes.length > 0 ? await getMethodTaxonomy() : null;
    const selectedCodeSet = new Set(selectedMethodCodes);

    // Streak badges
    const streakChecks: Array<[number, string]> = [
        [3, 'streak_3'],
        [7, 'streak_7'],
        [21, 'streak_21'],
        [100, 'streak_100']
    ];
    for (const [threshold, badgeId] of streakChecks) {
        if (stats.currentStreak >= threshold) {
            const badge = await awardBadge(telegramUserId, badgeId, 0);
            if (badge) unlocked.push(badge);
        }
    }

    // Total badges
    const totalChecks: Array<[number, string]> = [
        [10, 'total_10'],
        [100, 'total_100']
    ];
    for (const [threshold, badgeId] of totalChecks) {
        if (stats.totalCheckins >= threshold) {
            const badge = await awardBadge(telegramUserId, badgeId, 0);
            if (badge) unlocked.push(badge);
        }
    }

    // Time based badges
    const { rows: recentLogs } = await db.query(
        `SELECT created_at FROM telegram_checkin_logs WHERE telegram_user_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [telegramUserId]
    );
    if (recentLogs.length === 5 && stats.currentStreak >= 5) {
        let allMorning = true;
        let allNight = true;
        for (const log of recentLogs) {
            const hour = moment(log.created_at).tz(TIMEZONE).hour();
            if (hour < 5 || hour >= 7) allMorning = false;
            if (hour < 21 || hour >= 23) allNight = false;
        }
        if (allMorning) {
            const badge = await awardBadge(telegramUserId, 'time_morning', 0);
            if (badge) unlocked.push(badge);
        }
        if (allNight) {
            const badge = await awardBadge(telegramUserId, 'time_night', 0);
            if (badge) unlocked.push(badge);
        }
    }

    // Seasonal summer
    const summerSolsticeStr = getJieQiDateStr(currentYear, '夏至');
    if (summerSolsticeStr) {
        const summerSolstice = moment.tz(summerSolsticeStr, TIMEZONE);
        if (now.diff(summerSolstice, 'days') === 27) {
            const { rows } = await db.query(
                `SELECT COUNT(*) AS count
                 FROM telegram_checkin_logs
                 WHERE telegram_user_id = $1 AND checkin_date >= $2 AND checkin_date <= $3`,
                [telegramUserId, summerSolstice.format('YYYY-MM-DD'), now.format('YYYY-MM-DD')]
            );
            if (parseInt(rows[0].count, 10) >= 27) {
                const badge = await awardBadge(telegramUserId, 'seasonal_summer_27', currentYear);
                if (badge) unlocked.push(badge);
            }
        }
    }

    // Seasonal winter
    const winterSolsticeStr = getJieQiDateStr(currentYear, 'DONG_ZHI');
    if (winterSolsticeStr) {
        const winterSolstice = moment.tz(winterSolsticeStr, TIMEZONE);
        if (now.diff(winterSolstice, 'days') === 27) {
            const { rows } = await db.query(
                `WITH guishou_days AS (
                     SELECT DISTINCT l.checkin_date AS local_date
                     FROM telegram_checkin_logs l
                     LEFT JOIN telegram_checkin_method_selections s ON s.checkin_log_id = l.id
                     LEFT JOIN practice_methods pm ON pm.id = s.practice_method_id
                     WHERE l.telegram_user_id = $1
                       AND l.checkin_date >= $2
                       AND l.checkin_date <= $3
                       AND (
                           pm.code = ANY($4::text[])
                           OR COALESCE(l.note, '') LIKE ANY($5::text[])
                       )
                 )
                 SELECT COUNT(*) AS count FROM guishou_days`,
                [
                    telegramUserId,
                    winterSolstice.format('YYYY-MM-DD'),
                    now.format('YYYY-MM-DD'),
                    WINTER_GUISHOU_CODES,
                    WINTER_GUISHOU_NOTE_PATTERNS
                ]
            );
            if (parseInt(rows[0].count, 10) >= 27) {
                const badge = await awardBadge(telegramUserId, 'seasonal_winter_27', currentYear);
                if (badge) unlocked.push(badge);
            }
        }
    }

    if (taxonomy) {
        for (const combo of COMBO_BADGES) {
            const requiredLeafCodes = taxonomy.leafCodesByParentCode.get(combo.parentCode) || [];
            if (requiredLeafCodes.length === 0) continue;
            if (!requiredLeafCodes.every((code) => selectedCodeSet.has(code))) continue;

            const badge = await awardBadge(telegramUserId, combo.badgeId, currentYear);
            if (badge) unlocked.push(badge);
        }
    }

    return unlocked;
};

export const getUserBadges = async (telegramUserId: number) => {
    const { rows } = await db.query(
        `SELECT b.emoji, b.name, b.description, ub.earned_year, ub.unlocked_at
         FROM telegram_user_badges ub
         JOIN telegram_badges b ON b.id = ub.badge_id
         WHERE ub.telegram_user_id = $1
         ORDER BY ub.unlocked_at ASC`,
        [telegramUserId]
    );
    return rows;
};

export const getGroupedUserBadges = async (telegramUserId: number): Promise<GroupedBadge[]> => {
    const badges = await getUserBadges(telegramUserId);
    const grouped = new Map<string, GroupedBadge>();

    badges.forEach((badge) => {
        const existing: GroupedBadge = grouped.get(badge.name) || {
            emoji: badge.emoji || '',
            name: badge.name,
            count: 0,
            years: []
        };

        existing.count += 1;
        if (badge.earned_year && badge.earned_year !== 0) {
            existing.years.push(badge.earned_year);
        }

        grouped.set(badge.name, existing);
    });

    return Array.from(grouped.values());
};
