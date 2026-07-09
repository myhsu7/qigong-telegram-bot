import moment from 'moment-timezone';
import { Lunar } from 'lunar-javascript';
import { db } from '../db';
import { getUserStats } from './stats';
import { getMethodTaxonomy } from './taxonomy';
import { getSanFuPeriod } from '../utils/sanfu';

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
const METHOD_DAY_BADGE_GROUPS = [
    { methodName: '大雁功', prefix: 'method_dayan' },
    { methodName: '五禽戲', prefix: 'method_wuqinxi' },
    { methodName: '回春功', prefix: 'method_huichun' },
    { methodName: '龜壽功', prefix: 'method_guishou' },
    { methodName: '正陽功', prefix: 'method_zhengyang' },
    { methodName: '神奇晃海功', prefix: 'method_huanghai' },
    { methodName: '蓮花養心法', prefix: 'method_lotus' },
    { methodName: '和氣舒壓法', prefix: 'method_heqi' },
    { methodName: '三窩功', prefix: 'method_sanwo' },
    { methodName: '六音理臟法', prefix: 'method_liuyin' },
    { methodName: '靜功', prefix: 'method_jinggong' }
] as const;
const METHOD_DAY_THRESHOLDS = [7, 30, 100] as const;
const METHOD_DICTIONARY = [
    { name: '大雁功', aliases: ['大雁功', '大雁初', '大雁高', '大雁初高', '大雁初級', '大雁高級'] },
    { name: '五禽戲', aliases: ['五禽戲', '鶴戲', '猿戲', '虎戲', '熊戲', '鹿戲'] },
    { name: '回春功', aliases: ['回春功', '回春', '回春初', '回春中'] },
    { name: '龜壽功', aliases: ['龜壽功', '八卦功', '乾坤功', '鳳翔與龜縮'] },
    { name: '正陽功', aliases: ['正陽功', '正陽晨功', '晨功', '夜功'] },
    { name: '神奇晃海功', aliases: ['神奇晃海功', '晃海功', '晃海'] },
    { name: '蓮花養心法', aliases: ['蓮花養心法', '蓮花', '蓮花功'] },
    { name: '和氣舒壓法', aliases: ['和氣舒壓法', '和氣', '舒壓法'] },
    { name: '三窩功', aliases: ['三窩功'] },
    { name: '六音理臟法', aliases: ['六音理臟法'] },
    { name: '靜功', aliases: ['靜功', '周天靜功', '七星心法'] }
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

const getMethodDictCTE = () => {
    const values = METHOD_DICTIONARY
        .map((method) => `('${method.name}', ARRAY[${method.aliases.map((alias) => `'${alias}'`).join(',')}])`)
        .join(',\n');

    return `
        WITH method_dict AS (
            SELECT * FROM (VALUES ${values}) AS t(method_name, aliases)
        )
    `;
};

const getUserMethodDayCounts = async (telegramUserId: number) => {
    const query = `
        ${getMethodDictCTE()},
        structured AS (
            SELECT DISTINCT l.checkin_date AS local_date, COALESCE(parent_pm.name_zh, pm.name_zh) AS method_name
            FROM telegram_checkin_logs l
            JOIN telegram_checkin_method_selections s ON s.checkin_log_id = l.id
            JOIN practice_methods pm ON pm.id = s.practice_method_id
            LEFT JOIN practice_methods parent_pm ON parent_pm.id = pm.parent_id
            WHERE l.telegram_user_id = $2
        ),
        fallback_logs AS (
            SELECT l.id, COALESCE(l.checkin_date, DATE(l.created_at AT TIME ZONE $1)) AS local_date, COALESCE(l.note, '') AS note
            FROM telegram_checkin_logs l
            LEFT JOIN telegram_checkin_method_selections s ON s.checkin_log_id = l.id
            WHERE l.telegram_user_id = $2 AND s.id IS NULL
        ),
        fallback_matched AS (
            SELECT DISTINCT l.local_date, md.method_name
            FROM fallback_logs l
            JOIN method_dict md ON EXISTS (
                SELECT 1 FROM unnest(md.aliases) a WHERE l.note ILIKE '%' || a || '%'
            )
        ),
        matched AS (
            SELECT * FROM structured
            UNION ALL
            SELECT * FROM fallback_matched
        )
        SELECT method_name, COUNT(*) AS matched_days
        FROM matched
        GROUP BY method_name
    `;

    const { rows } = await db.query(query, [TIMEZONE, telegramUserId]);
    return new Map<string, number>(rows.map((row) => [row.method_name, parseInt(row.matched_days, 10)]));
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
    const sanFuPeriod = getSanFuPeriod(currentYear);
    if (sanFuPeriod && now.isSame(sanFuPeriod.end, 'day')) {
        const { rows } = await db.query(
            `SELECT COUNT(*) AS count
             FROM telegram_checkin_logs
             WHERE telegram_user_id = $1 AND checkin_date >= $2 AND checkin_date <= $3`,
            [telegramUserId, sanFuPeriod.start.format('YYYY-MM-DD'), sanFuPeriod.end.format('YYYY-MM-DD')]
        );
        if (parseInt(rows[0].count, 10) >= sanFuPeriod.totalDays) {
            const badge = await awardBadge(telegramUserId, 'seasonal_summer_27', currentYear);
            if (badge) unlocked.push(badge);
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

    const methodDayCounts = await getUserMethodDayCounts(telegramUserId);
    for (const group of METHOD_DAY_BADGE_GROUPS) {
        const matchedDays = methodDayCounts.get(group.methodName) || 0;
        for (const threshold of METHOD_DAY_THRESHOLDS) {
            if (matchedDays < threshold) continue;

            const badge = await awardBadge(telegramUserId, `${group.prefix}_${threshold}`, 0);
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
