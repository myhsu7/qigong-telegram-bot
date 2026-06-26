import { db } from '../db';

export interface MethodMixItem {
    methodName: string;
    matchedDays: number;
    attendanceRatio: number;
    compositionRatio: number;
}

export interface MethodMixResult {
    periodDays: number;
    totalCheckinDays: number;
    totalMatchedMethodDays: number;
    methods: MethodMixItem[];
}

export const getUserMethodMix = async (telegramUserId: number, periodDays: number): Promise<MethodMixResult> => {
    const totalDaysQuery = `
        SELECT COUNT(*) AS total_checkin_days
        FROM telegram_checkin_logs
        WHERE telegram_user_id = $1
          AND checkin_date >= (CURRENT_DATE - ($2::int - 1))
    `;
    const totalDaysRes = await db.query(totalDaysQuery, [telegramUserId, periodDays]);
    const totalCheckinDays = parseInt(totalDaysRes.rows[0]?.total_checkin_days || '0', 10);

    const methodsQuery = `
        SELECT pm.name_zh AS method_name, COUNT(*) AS matched_days
        FROM telegram_checkin_logs l
        JOIN telegram_checkin_method_selections s ON s.checkin_log_id = l.id
        JOIN practice_methods pm ON pm.id = s.practice_method_id
        WHERE l.telegram_user_id = $1
          AND l.checkin_date >= (CURRENT_DATE - ($2::int - 1))
        GROUP BY pm.name_zh
        ORDER BY matched_days DESC, pm.name_zh ASC
    `;
    const methodsRes = await db.query(methodsQuery, [telegramUserId, periodDays]);
    const totalMatchedMethodDays = methodsRes.rows.reduce((sum, row) => sum + parseInt(row.matched_days, 10), 0);

    return {
        periodDays,
        totalCheckinDays,
        totalMatchedMethodDays,
        methods: methodsRes.rows.map((row) => {
            const matchedDays = parseInt(row.matched_days, 10);
            return {
                methodName: row.method_name,
                matchedDays,
                attendanceRatio: totalCheckinDays > 0 ? matchedDays / totalCheckinDays : 0,
                compositionRatio: totalMatchedMethodDays > 0 ? matchedDays / totalMatchedMethodDays : 0
            };
        })
    };
};

export const buildMethodMixMessage = (result: MethodMixResult) => {
    if (result.totalCheckinDays === 0 || result.methods.length === 0) {
        return `📈 最近 ${result.periodDays} 天尚無足夠功法打卡資料。`;
    }

    let msg = `📈 你的功法分析（最近 ${result.periodDays} 天）\n\n`;
    msg += `🧘 主要修練功法：\n`;
    result.methods.slice(0, 3).forEach((method, index) => {
        msg += `${index + 1}. ${method.methodName}：${(method.compositionRatio * 100).toFixed(1)}%（${method.matchedDays} 天）\n`;
    });

    const topMethod = result.methods[0];
    msg += `\n💡 小點評：\n`;
    if (topMethod.compositionRatio >= 0.6) {
        msg += `你最近以「${topMethod.methodName}」為主，練功重心很明確，節奏穩定。`;
    } else {
        msg += `你最近的功法分布相當均衡，整體配置很不錯。`;
    }

    return msg.trim();
};
