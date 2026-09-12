import moment from 'moment-timezone';
import { db } from '../db';
import { GroupedBadge, getGroupedUserBadges } from './badges';
import { getUserStats, UserStats } from './stats';
import { getGroupedMethodRowsForLeafIds, getLocalizedMethodName, getMethodTaxonomy } from './taxonomy';
import { Locale } from '../i18n';
import { mergeLegacyPracticeNotes } from './checkin';

const TIMEZONE = 'Asia/Taipei';

export interface TelegramHistoryEntry {
    id: number;
    date: string;
    groupedMethods: string[];
    leafMethods: string[];
    practiceNote: string;
    reflectionNote: string;
    bodyFeelingNote: string;
    source: string | null;
    entryKind: 'regular' | 'makeup';
    practiceTimezone: string;
    recordedAt: string;
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
    monthParam?: string | null,
    locale: Locale = 'zh_TW',
    practiceTimezone = TIMEZONE
): Promise<TelegramHistoryResponse> => {
    const now = moment().tz(practiceTimezone);
    let targetMonth = now.clone();

    if (monthParam) {
        const parsedMonth = moment.tz(monthParam, 'YYYY-MM', practiceTimezone);
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
                    l.practice_note,
                    l.reflection_note,
                    l.body_feeling_note,
                     l.source,
                     l.entry_kind,
                     l.practice_timezone,
                     l.created_at,
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
        getUserStats(telegramUserId, practiceTimezone),
        getGroupedUserBadges(telegramUserId, locale)
    ]);

    const entries: TelegramHistoryEntry[] = logsRes.rows.map((row) => {
        const methodIds = Array.isArray(row.method_ids)
            ? row.method_ids.map((methodId: string | number) => Number(methodId)).filter((methodId: number) => Number.isFinite(methodId))
            : [];

        const practiceNote = row.practice_note || mergeLegacyPracticeNotes(row.reflection_note, row.body_feeling_note, locale);
        return {
            id: row.id,
            date: row.checkin_date,
            groupedMethods: getGroupedMethodRowsForLeafIds(methodIds, taxonomy).map((method) => getLocalizedMethodName(method, locale)),
            leafMethods: methodIds.flatMap((methodId: number) => {
                const method = taxonomy.rowById.get(methodId);
                return method ? [getLocalizedMethodName(method, locale)] : [];
            }),
            practiceNote,
            reflectionNote: practiceNote,
            bodyFeelingNote: '',
            source: row.source || null,
            entryKind: row.entry_kind === 'makeup' ? 'makeup' : 'regular',
            practiceTimezone: row.practice_timezone || practiceTimezone,
            recordedAt: moment(row.created_at).toISOString()
        };
    });

    return {
        month: targetMonth.format('YYYY-MM'),
        monthLabel: locale === 'en' ? targetMonth.locale('en').format('MMMM YYYY') : targetMonth.format('YYYY年 MM月'),
        entries,
        stats,
        checkinDaysInMonth: entries.length,
        badges
    };
};
