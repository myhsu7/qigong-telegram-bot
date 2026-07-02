import { db } from '../db';
import { getMethodTaxonomy } from './taxonomy';

export interface MethodMixItem {
    methodId: number;
    methodCode: string;
    methodName: string;
    matchedDays: number;
    attendanceRatio: number;
    compositionRatio: number;
}

export interface MethodMixResult {
    periodDays: number;
    totalCheckinDays: number;
    totalMatchedMethodDays: number;
    totalMatchedLeafDays: number;
    totalMatchedGroupDays: number;
    methods: MethodMixItem[];
    leafMethods: MethodMixItem[];
    groupMethods: MethodMixItem[];
}

export interface UserPracticeJournalEntry {
    id: number;
    date: string;
    groupedMethods: string[];
    leafMethods: string[];
    reflectionNote: string;
    bodyFeelingNote: string;
}

interface MethodSelectionRow {
    checkinLogId: number;
    methodId: number;
    methodCode: string;
    methodName: string;
}

export const searchTelegramUsers = async (keyword: string) => {
    const { rows } = await db.query(
        `SELECT telegram_user_id, username, first_name, last_name
         FROM telegram_users
         WHERE COALESCE(first_name,'') ILIKE $1
            OR COALESCE(last_name,'') ILIKE $1
            OR COALESCE(username,'') ILIKE $1
         ORDER BY updated_at DESC
         LIMIT 20`,
        [`%${keyword}%`]
    );
    return rows.map((row) => ({
        telegramUserId: row.telegram_user_id,
        displayName: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || (row.username ? `@${row.username}` : `User ${row.telegram_user_id}`)
    }));
};

const buildMethodMixItems = (
    counts: Array<{ methodId: number; methodCode: string; methodName: string; matchedDays: number }>,
    totalCheckinDays: number,
    totalMatchedDays: number
): MethodMixItem[] => {
    return counts
        .sort((a, b) => {
            if (b.matchedDays !== a.matchedDays) return b.matchedDays - a.matchedDays;
            return a.methodName.localeCompare(b.methodName, 'zh-Hant');
        })
        .map((item) => ({
            methodId: item.methodId,
            methodCode: item.methodCode,
            methodName: item.methodName,
            matchedDays: item.matchedDays,
            attendanceRatio: totalCheckinDays > 0 ? item.matchedDays / totalCheckinDays : 0,
            compositionRatio: totalMatchedDays > 0 ? item.matchedDays / totalMatchedDays : 0
        }));
};

const buildMethodMixResult = async (
    periodDays: number,
    totalCheckinDays: number,
    selectionRows: MethodSelectionRow[]
): Promise<MethodMixResult> => {
    const taxonomy = await getMethodTaxonomy();
    const leafCounts = new Map<number, { methodId: number; methodCode: string; methodName: string; matchedDays: number }>();
    const groupCounts = new Map<number, { methodId: number; methodCode: string; methodName: string; matchedDays: number }>();
    const seenGroupSelections = new Set<string>();

    selectionRows.forEach((row) => {
        const existingLeaf = leafCounts.get(row.methodId) || {
            methodId: row.methodId,
            methodCode: row.methodCode,
            methodName: row.methodName,
            matchedDays: 0
        };
        existingLeaf.matchedDays += 1;
        leafCounts.set(row.methodId, existingLeaf);

        const groupedRow = taxonomy.parentByLeafId.get(row.methodId) || taxonomy.rowById.get(row.methodId);
        if (!groupedRow) return;

        const groupSelectionKey = `${groupedRow.id}:${row.checkinLogId}`;
        if (seenGroupSelections.has(groupSelectionKey)) return;
        seenGroupSelections.add(groupSelectionKey);

        const existingGroup = groupCounts.get(groupedRow.id) || {
            methodId: groupedRow.id,
            methodCode: groupedRow.code,
            methodName: groupedRow.nameZh,
            matchedDays: 0
        };
        existingGroup.matchedDays += 1;
        groupCounts.set(groupedRow.id, existingGroup);
    });

    const totalMatchedLeafDays = Array.from(leafCounts.values()).reduce((sum, item) => sum + item.matchedDays, 0);
    const totalMatchedGroupDays = Array.from(groupCounts.values()).reduce((sum, item) => sum + item.matchedDays, 0);
    const leafMethods = buildMethodMixItems(Array.from(leafCounts.values()), totalCheckinDays, totalMatchedLeafDays);
    const groupMethods = buildMethodMixItems(Array.from(groupCounts.values()), totalCheckinDays, totalMatchedGroupDays);

    return {
        periodDays,
        totalCheckinDays,
        totalMatchedMethodDays: totalMatchedGroupDays,
        totalMatchedLeafDays,
        totalMatchedGroupDays,
        methods: groupMethods,
        leafMethods,
        groupMethods
    };
};

const getMethodSelectionRows = async (periodDays: number, telegramUserId?: number): Promise<MethodSelectionRow[]> => {
    const params: Array<number> = [periodDays];
    const userFilter = typeof telegramUserId === 'number' ? 'AND l.telegram_user_id = $2' : '';
    if (typeof telegramUserId === 'number') {
        params.push(telegramUserId);
    }

    const { rows } = await db.query(
        `SELECT l.id AS checkin_log_id,
                pm.id AS method_id,
                pm.code AS method_code,
                pm.name_zh AS method_name
         FROM telegram_checkin_logs l
         JOIN telegram_checkin_method_selections s ON s.checkin_log_id = l.id
         JOIN practice_methods pm ON pm.id = s.practice_method_id
         WHERE l.checkin_date >= (CURRENT_DATE - ($1::int - 1))
           ${userFilter}
         ORDER BY l.id ASC, pm.sort_order ASC, pm.id ASC`,
        params
    );

    return rows.map((row) => ({
        checkinLogId: Number(row.checkin_log_id),
        methodId: Number(row.method_id),
        methodCode: row.method_code,
        methodName: row.method_name
    }));
};

export const getUserPracticeJournal = async (telegramUserId: number, limit = 12): Promise<UserPracticeJournalEntry[]> => {
    const taxonomy = await getMethodTaxonomy();
    const { rows } = await db.query(
        `SELECT l.id,
                l.checkin_date,
                l.reflection_note,
                l.body_feeling_note,
                ARRAY_AGG(pm.id ORDER BY pm.sort_order ASC, pm.id ASC)
                    FILTER (WHERE pm.id IS NOT NULL) AS method_ids,
                ARRAY_AGG(pm.name_zh ORDER BY pm.sort_order ASC, pm.id ASC)
                    FILTER (WHERE pm.id IS NOT NULL) AS leaf_method_names
         FROM telegram_checkin_logs l
         LEFT JOIN telegram_checkin_method_selections s ON s.checkin_log_id = l.id
         LEFT JOIN practice_methods pm ON pm.id = s.practice_method_id
         WHERE l.telegram_user_id = $1
           AND (
               COALESCE(BTRIM(l.reflection_note), '') <> ''
               OR COALESCE(BTRIM(l.body_feeling_note), '') <> ''
           )
         GROUP BY l.id
         ORDER BY l.checkin_date DESC
         LIMIT $2`,
        [telegramUserId, limit]
    );

    return rows.map((row) => {
        const methodIds = Array.isArray(row.method_ids)
            ? row.method_ids.map((methodId: number | string) => Number(methodId)).filter((methodId: number) => Number.isFinite(methodId))
            : [];
        const groupedMethodNames = new Map<number, string>();

        methodIds.forEach((methodId: number) => {
            const groupedMethod = taxonomy.parentByLeafId.get(methodId) || taxonomy.rowById.get(methodId);
            if (groupedMethod) {
                groupedMethodNames.set(groupedMethod.id, groupedMethod.nameZh);
            }
        });

        return {
            id: Number(row.id),
            date: row.checkin_date,
            groupedMethods: Array.from(groupedMethodNames.values()),
            leafMethods: Array.isArray(row.leaf_method_names)
                ? row.leaf_method_names.filter((name: string | null) => typeof name === 'string')
                : [],
            reflectionNote: row.reflection_note || '',
            bodyFeelingNote: row.body_feeling_note || ''
        };
    });
};

export const getCommunityMethodMix = async (periodDays: number): Promise<MethodMixResult> => {
    const totalDaysQuery = `
        SELECT COUNT(*) AS total_checkin_days
        FROM telegram_checkin_logs
        WHERE checkin_date >= (CURRENT_DATE - ($1::int - 1))
    `;
    const totalDaysRes = await db.query(totalDaysQuery, [periodDays]);
    const totalCheckinDays = parseInt(totalDaysRes.rows[0]?.total_checkin_days || '0', 10);

    return buildMethodMixResult(periodDays, totalCheckinDays, await getMethodSelectionRows(periodDays));
};

export const getUserMethodMix = async (telegramUserId: number, periodDays: number): Promise<MethodMixResult> => {
    const totalDaysQuery = `
        SELECT COUNT(*) AS total_checkin_days
        FROM telegram_checkin_logs
        WHERE telegram_user_id = $1
          AND checkin_date >= (CURRENT_DATE - ($2::int - 1))
    `;
    const totalDaysRes = await db.query(totalDaysQuery, [telegramUserId, periodDays]);
    const totalCheckinDays = parseInt(totalDaysRes.rows[0]?.total_checkin_days || '0', 10);

    return buildMethodMixResult(periodDays, totalCheckinDays, await getMethodSelectionRows(periodDays, telegramUserId));
};

export const buildMethodMixMessage = (result: MethodMixResult) => {
    const primaryMethods = result.groupMethods.length > 0 ? result.groupMethods : result.leafMethods;

    if (result.totalCheckinDays === 0 || primaryMethods.length === 0) {
        return `📈 最近 ${result.periodDays} 天尚無足夠功法打卡資料。`;
    }

    let msg = `📈 你的功法分析（最近 ${result.periodDays} 天）\n\n`;
    msg += `🧘 主要修練分組：\n`;
    primaryMethods.slice(0, 3).forEach((method, index) => {
        msg += `${index + 1}. ${method.methodName}：${(method.compositionRatio * 100).toFixed(1)}%（${method.matchedDays} 天）\n`;
    });

    const topMethod = primaryMethods[0];
    msg += `\n💡 小點評：\n`;
    if (topMethod.compositionRatio >= 0.6) {
        msg += `你最近以「${topMethod.methodName}」為主，練功重心很明確，節奏穩定。`;
    } else {
        msg += `你最近的功法分布相當均衡，整體配置很不錯。`;
    }

    return msg.trim();
};
