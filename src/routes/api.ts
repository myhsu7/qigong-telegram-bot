import { Request, Router } from 'express';
import { verifyTelegramWebAppInitData } from '../utils/telegramWebApp';
import { getPracticeMethods, getTodayCheckin, saveTodayCheckin, upsertTelegramUser } from '../services/checkin';
import { getLevelTitle, getUserStats } from '../services/stats';
import { evaluateTelegramBadges } from '../services/badges';
import { getUserBadges } from '../services/badges';
import { sendTelegramCheckinSummary } from '../bot/telegram';

const router = Router();

const resolveInitData = (req: Request) => {
    return req.header('x-telegram-init-data') || req.body?.initData || req.query?.initData || '';
};

router.get('/practice-methods', async (req, res) => {
    try {
        const methods = await getPracticeMethods();
        res.json({ methods });
    } catch (error) {
        console.error('[api] failed to load practice methods', error);
        res.status(500).json({ error: 'Failed to load practice methods' });
    }
});

router.get('/checkin/today', async (req, res) => {
    try {
        const initData = resolveInitData(req);
        const auth = verifyTelegramWebAppInitData(initData);
        await upsertTelegramUser(auth.user);
        const data = await getTodayCheckin(auth.user.id);
        res.json(data);
    } catch (error) {
        console.error('[api] failed to load today checkin', error);
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
        const unlockedBadges = saved.alreadyCheckedIn ? [] : await evaluateTelegramBadges(auth.user.id, saved.selectedMethods);
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

export default router;
