import { Request, Router } from 'express';
import { verifyTelegramWebAppInitData } from '../utils/telegramWebApp';
import { getPracticeMethods, getTodayCheckin, saveTodayCheckin, upsertTelegramUser } from '../services/checkin';
import { getUserStats } from '../services/stats';

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

        const methodIds = Array.isArray(req.body?.methodIds) ? req.body.methodIds.map((id: unknown) => Number(id)) : [];
        const reflectionNote = typeof req.body?.reflectionNote === 'string' ? req.body.reflectionNote : '';
        const bodyFeelingNote = typeof req.body?.bodyFeelingNote === 'string' ? req.body.bodyFeelingNote : '';

        const saved = await saveTodayCheckin(auth.user.id, methodIds, reflectionNote, bodyFeelingNote);
        const stats = await getUserStats(auth.user.id);
        res.json({ ok: true, ...saved, stats });
    } catch (error) {
        console.error('[api] failed to save today checkin', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to save check-in' });
    }
});

export default router;
