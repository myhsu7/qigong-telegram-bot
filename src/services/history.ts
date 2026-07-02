import moment from 'moment-timezone';
import { db } from '../db';
import { GroupedBadge, getGroupedUserBadges } from './badges';
import { getUserStats, UserStats } from './stats';
import { getGroupedMethodRowsForLeafIds, getMethodTaxonomy } from './taxonomy';

const TIMEZONE = 'Asia/Taipei';

export interface TelegramHistoryEntry {
    id: number;
    date: string;
    groupedMethods: string[];
    leafMethods: string[];
    reflectionNote: string;
    bodyFeelingNote: string;
    source: string | null;
}

export interface TelegramHistoryResponse {
    month: string;
    monthLabel: string;
    entries: TelegramHistoryEntry[];
    stats: UserStats;
    checkinDaysInMonth: number;
    badges: GroupedBadge[];
}

export const getTelegramHistory = async (
    telegramUserId: number,
    monthParam?: string | null
): Promise<TelegramHistoryResponse> => {
    const now = moment().tz(TIMEZONE);
    let targetMonth = now.clone();

    if (monthParam) {
        const parsedMonth = moment.tz(monthParam, 'YYYY-MM', TIMEZONE);
        if (parsedMonth.isValid()) {
            targetMonth = parsedMonth;
        }
    }

    const monthStart = targetMonth.clone().startOf('month').format('YYYY-MM-DD');
    const monthEnd = targetMonth.clone().endOf('month').format('YYYY-MM-DD');

    const [taxonomy, logsRes, stats, badges] = await Promise.all([
        getMethodTaxonomy(),
        db.query(
            `SELECT l.id,
                    l.checkin_date,
                    l.reflection_note,
                    l.body_feeling_note,
                    l.source,
                    ARRAY_AGG(pm.id ORDER BY pm.sort_order ASC, pm.id ASC)
                        FILTER (WHERE pm.id IS NOT NULL) AS method_ids,
                    ARRAY_AGG(pm.name_zh ORDER BY pm.sort_order ASC, pm.id ASC)
                        FILTER (WHERE pm.id IS NOT NULL) AS leaf_method_names
             FROM telegram_checkin_logs l
             LEFT JOIN telegram_checkin_method_selections s ON s.checkin_log_id = l.id
             LEFT JOIN practice_methods pm ON pm.id = s.practice_method_id
             WHERE l.telegram_user_id = $1
               AND l.checkin_date >= $2
               AND l.checkin_date <= $3
             GROUP BY l.id
             ORDER BY l.checkin_date DESC`,
            [telegramUserId, monthStart, monthEnd]
        ),
        getUserStats(telegramUserId),
        getGroupedUserBadges(telegramUserId)
    ]);

    const entries: TelegramHistoryEntry[] = logsRes.rows.map((row) => {
        const methodIds = Array.isArray(row.method_ids)
            ? row.method_ids.map((methodId: string | number) => Number(methodId)).filter((methodId: number) => Number.isFinite(methodId))
            : [];

        return {
            id: row.id,
            date: row.checkin_date,
            groupedMethods: getGroupedMethodRowsForLeafIds(methodIds, taxonomy).map((method) => method.nameZh),
            leafMethods: Array.isArray(row.leaf_method_names)
                ? row.leaf_method_names.filter((name: string | null) => typeof name === 'string')
                : [],
            reflectionNote: row.reflection_note || '',
            bodyFeelingNote: row.body_feeling_note || '',
            source: row.source || null,
        };
    });

    return {
        month: targetMonth.format('YYYY-MM'),
        monthLabel: targetMonth.format('YYYY年 MM月'),
        entries,
        stats,
        checkinDaysInMonth: entries.length,
        badges
    };
};
