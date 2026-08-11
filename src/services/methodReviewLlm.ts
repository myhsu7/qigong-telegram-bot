import { env } from '../config/env';
import { db } from '../db';
import { MethodMixResult } from './methodAnalysis';

const REVIEW_CACHE_TTL_MS = 5 * 60 * 1000;
const reviewCache = new Map<string, { review: string; expiresAt: number }>();
const pendingReviews = new Map<string, Promise<string>>();

const buildCacheKey = (telegramUserId: number, analysis: MethodMixResult) => {
    const methods = (analysis.groupMethods.length > 0 ? analysis.groupMethods : analysis.leafMethods)
        .map((method) => `${method.methodCode}:${method.matchedDays}:${method.compositionRatio.toFixed(6)}`)
        .join('|');
    return `${telegramUserId}:${analysis.periodDays}:${analysis.totalCheckinDays}:${analysis.totalMatchedMethodDays}:${methods}`;
};

const trimTo200Chars = (text: string) => {
    const trimmed = text.trim();
    return trimmed.length <= 200 ? trimmed : `${trimmed.slice(0, 197).trimEnd()}...`;
};

const buildPrompt = (analysis: MethodMixResult) => {
    const methods = (analysis.groupMethods.length > 0 ? analysis.groupMethods : analysis.leafMethods)
        .slice(0, 8)
        .map((method) => `- ${method.methodName}：${method.matchedDays}天（${(method.compositionRatio * 100).toFixed(1)}%）`)
        .join('\n');

    return {
        system: [
            '你是一位熟悉道家養生與氣功修練節奏的助教。',
            `請根據學員近${analysis.periodDays}天的主功法分布資料，給出接下來的練功指引。`,
            '要求：',
            '1. 使用繁體中文',
            '2. 200字以內',
            '3. 語氣溫和、鼓勵、具體',
            '4. 只根據提供的資料做判斷，不要虛構',
            '5. 重點放在功法配置、持續性、平衡性與下一步方向',
            '6. 不提供醫療診斷或療效承諾',
            '7. 直接輸出建議，不要加標題'
        ].join('\n'),
        user: [
            `以下是學員近${analysis.periodDays}天主功法分布資料：`,
            '',
            `總打卡天數：${analysis.totalCheckinDays}`,
            `功法分布總次數：${analysis.totalMatchedMethodDays}`,
            '',
            '主功法分布：',
            methods || '- 無資料',
            '',
            '請根據以上資料，用200字內給出接下來的練功指引。'
        ].join('\n')
    };
};

const generateReview = async (
    analysis: MethodMixResult,
    fallbackText: string,
    telegramUserId: number,
    cacheKey: string,
    primaryMethods: MethodMixResult['groupMethods']
) => {
    if (env.localLlmCriteria > 0) {
        try {
            const { rows } = await db.query(
                'SELECT COUNT(*) AS total_checkins FROM telegram_checkin_logs WHERE telegram_user_id = $1',
                [telegramUserId]
            );
            const totalLifetimeCheckins = Number(rows[0]?.total_checkins || 0);
            if (totalLifetimeCheckins < env.localLlmCriteria) return fallbackText;
        } catch (error) {
            console.error(`[method-review-llm] userSuffix=${String(telegramUserId).slice(-6)} status=fallback reason=criteria-query`, error);
            return fallbackText;
        }
    }

    const prompts = buildPrompt(analysis);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.localLlmTimeoutMs);
    const startedAt = Date.now();

    try {
        const response = await fetch(`${env.localLlmBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.localLlmApiKey}`
            },
            body: JSON.stringify({
                model: env.localLlmModel,
                messages: [
                    { role: 'system', content: prompts.system },
                    { role: 'user', content: prompts.user }
                ],
                temperature: 0.7,
                max_tokens: 220
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`LLM API returned status ${response.status}`);
        }

        const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = payload.choices?.[0]?.message?.content?.trim() || '';
        if (!content) throw new Error('LLM returned empty content');

        console.log(`[method-review-llm] userSuffix=${String(telegramUserId).slice(-6)} model=${env.localLlmModel} period=${analysis.periodDays} duration=${Date.now() - startedAt}ms status=success methods=${primaryMethods.length}`);
        const review = trimTo200Chars(content);
        if (reviewCache.size >= 1000) {
            const now = Date.now();
            reviewCache.forEach((entry, key) => {
                if (entry.expiresAt <= now) reviewCache.delete(key);
            });
            if (reviewCache.size >= 1000) reviewCache.delete(reviewCache.keys().next().value as string);
        }
        reviewCache.set(cacheKey, { review, expiresAt: Date.now() + REVIEW_CACHE_TTL_MS });
        return review;
    } catch (error) {
        console.error(`[method-review-llm] userSuffix=${String(telegramUserId).slice(-6)} model=${env.localLlmModel} period=${analysis.periodDays} duration=${Date.now() - startedAt}ms status=fallback methods=${primaryMethods.length}`, error);
        return fallbackText;
    } finally {
        clearTimeout(timeout);
    }
};

export const generateMethodReviewWithLlm = async (
    analysis: MethodMixResult,
    fallbackText: string,
    telegramUserId: number
) => {
    const primaryMethods = analysis.groupMethods.length > 0 ? analysis.groupMethods : analysis.leafMethods;
    if (!env.localLlmEnabled || !env.localLlmBaseUrl || !env.localLlmModel || primaryMethods.length === 0) {
        return fallbackText;
    }

    const cacheKey = buildCacheKey(telegramUserId, analysis);
    const cached = reviewCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.review;
    if (cached) reviewCache.delete(cacheKey);

    const pending = pendingReviews.get(cacheKey);
    if (pending) return pending;

    const request = generateReview(analysis, fallbackText, telegramUserId, cacheKey, primaryMethods)
        .finally(() => pendingReviews.delete(cacheKey));
    pendingReviews.set(cacheKey, request);
    return request;
};
