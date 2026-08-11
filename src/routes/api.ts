import { Request, Router } from 'express';
import { verifyTelegramWebAppInitData } from '../utils/telegramWebApp';
import { getPracticeMethods, getTodayCheckin, saveTodayCheckin, upsertTelegramUser } from '../services/checkin';
import { getLeaderboard, getLevelTitle, getUserStats, LeaderboardPeriod } from '../services/stats';
import { evaluateTelegramBadges } from '../services/badges';
import { getUserBadges } from '../services/badges';
import { sendTelegramCheckinSummary } from '../services/chatSummary';
import { getTelegramHistory } from '../services/history';
import { buildMethodReview, getUserMethodMix, getUserPracticeJournal } from '../services/methodAnalysis';
import { generateMethodReviewWithLlm } from '../services/methodReviewLlm';

const router = Router();

const resolveInitData = (req: Request) => {
    return req.header('x-telegram-init-data') || req.body?.initData || '';
};

router.get('/practice-methods', async (req, res) => {
    const startedAt = Date.now();
    try {
        const methods = await getPracticeMethods();
        console.log(`[api] loaded practice methods in ${Date.now() - startedAt}ms (${methods.length} roots)`);
        res.json({ methods });
    } catch (error) {
        console.error(`[api] failed to load practice methods after ${Date.now() - startedAt}ms`, error);
        res.status(500).json({ error: 'Failed to load practice methods' });
    }
});

router.get('/checkin/today', async (req, res) => {
    const startedAt = Date.now();
    try {
        const initData = resolveInitData(req);
        const auth = verifyTelegramWebAppInitData(initData);
        await upsertTelegramUser(auth.user);
        const data = await getTodayCheckin(auth.user.id);
        console.log(`[api] loaded today checkin in ${Date.now() - startedAt}ms for ${auth.user.id}`);
        res.json(data);
    } catch (error) {
        console.error(`[api] failed to load today checkin after ${Date.now() - startedAt}ms`, error);
        res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
    }
});

router.post('/checkin', async (req, res) => {
    try {
        const initData = resolveInitData(req);
        const auth = verifyTelegramWebAppInitData(initData);
        await upsertTelegramUser(auth.user);

        const methodIds: number[] = Array.isArray(req.body?.methodIds)
            ? Array.from(new Set(
                req.body.methodIds
                    .map((id: unknown) => Number(id))
                    .filter((id: number) => Number.isFinite(id) && id > 0)
            ))
            : [];
        const reflectionNote = typeof req.body?.reflectionNote === 'string' ? req.body.reflectionNote : '';
        const bodyFeelingNote = typeof req.body?.bodyFeelingNote === 'string' ? req.body.bodyFeelingNote : '';

        const saved = await saveTodayCheckin(auth.user.id, methodIds, reflectionNote, bodyFeelingNote);
        const unlockedBadges = await evaluateTelegramBadges(auth.user.id, saved.selectedMethodCodes);
        const stats = await getUserStats(auth.user.id);
        try {
            await sendTelegramCheckinSummary(auth.user.id, {
                selectedMethods: saved.selectedMethods,
                stats,
                unlockedBadges
            });
        } catch (summaryError) {
            console.error('[api] failed to send check-in summary to Telegram chat', summaryError);
        }
        res.json({ ok: true, ...saved, stats, unlockedBadges });
    } catch (error) {
        console.error('[api] failed to save today checkin', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to save check-in' });
    }
});

router.get('/history', async (req, res) => {
    try {
        const initData = resolveInitData(req);
        const auth = verifyTelegramWebAppInitData(initData);
        await upsertTelegramUser(auth.user);

        const monthParam = typeof req.query.month === 'string' ? req.query.month : undefined;
        const data = await getTelegramHistory(auth.user.id, monthParam);
        res.json(data);
    } catch (error) {
        console.error('[api] failed to load history', error);
        res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
    }
});

router.get('/achievements', async (req, res) => {
    try {
        const initData = resolveInitData(req);
        const auth = verifyTelegramWebAppInitData(initData);
        await upsertTelegramUser(auth.user);

        const stats = await getUserStats(auth.user.id);
        const badges = await getUserBadges(auth.user.id);
        const levelTitle = getLevelTitle(stats.totalCheckins);

        let nextMilestone = null;
        if (stats.totalCheckins < 30) {
            nextMilestone = { type: 'level', title: '築基 (Level 2)', remaining: 30 - stats.totalCheckins, unit: '天總打卡' };
        } else if (stats.totalCheckins < 90) {
            nextMilestone = { type: 'level', title: '結丹 (Level 3)', remaining: 90 - stats.totalCheckins, unit: '天總打卡' };
        } else if (stats.totalCheckins < 200) {
            nextMilestone = { type: 'level', title: '化境 (Level 4)', remaining: 200 - stats.totalCheckins, unit: '天總打卡' };
        }

        res.json({ stats, badges, levelTitle, nextMilestone });
    } catch (error) {
        console.error('[api] failed to load achievements', error);
        res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
    }
});

router.get('/leaderboard', async (req, res) => {
    let auth: ReturnType<typeof verifyTelegramWebAppInitData>;
    try {
        auth = verifyTelegramWebAppInitData(resolveInitData(req));
    } catch (error) {
        return res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
    }
    try {
        await upsertTelegramUser(auth.user);
        const period = typeof req.query.period === 'string' ? req.query.period : 'week';
        if (!['week', 'month', 'quarter', 'year', 'all'].includes(period)) {
            return res.status(400).json({ error: 'Invalid period' });
        }
        const data = await getLeaderboard(period as LeaderboardPeriod);
        const currentUserId = Number(auth.user.id);
        res.json({
            period,
            totals: data.totals.map((row, index) => ({
                rank: index + 1,
                displayName: row.displayName,
                totalDays: row.totalDays,
                isCurrentUser: row.telegramUserId === currentUserId
            })),
            streaks: data.streaks.map((row, index) => ({
                rank: index + 1,
                displayName: row.displayName,
                maxStreak: row.maxStreak,
                isCurrentUser: row.telegramUserId === currentUserId
            }))
        });
    } catch (error) {
        console.error('[api] failed to load leaderboard', error);
        res.status(500).json({ error: 'Failed to load leaderboard' });
    }
});

router.get('/method-analysis', async (req, res) => {
    let auth: ReturnType<typeof verifyTelegramWebAppInitData>;
    try {
        auth = verifyTelegramWebAppInitData(resolveInitData(req));
    } catch (error) {
        return res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
    }
    try {
        await upsertTelegramUser(auth.user);
        const [analysis30, analysis90, journal] = await Promise.all([
            getUserMethodMix(auth.user.id, 30),
            getUserMethodMix(auth.user.id, 90),
            getUserPracticeJournal(auth.user.id)
        ]);
        const [reviewText30, reviewText90] = await Promise.all([
            generateMethodReviewWithLlm(analysis30, buildMethodReview(analysis30), auth.user.id),
            generateMethodReviewWithLlm(analysis90, buildMethodReview(analysis90), auth.user.id)
        ]);
        res.json({ analysis30, analysis90, reviewText: reviewText30, reviewText30, reviewText90, journal });
    } catch (error) {
        console.error('[api] failed to load method analysis', error);
        res.status(500).json({ error: 'Failed to load method analysis' });
    }
});

export default router;
