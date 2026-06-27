import { Router } from 'express';
import path from 'path';
import { getCommunityMethodMix, getUserMethodMix, searchTelegramUsers } from '../services/methodAnalysis';

const router = Router();

router.get('/method-analysis', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'public', 'admin', 'method-analysis.html'));
});

router.get('/api/method-analysis/summary', async (req, res) => {
    try {
        const period = (req.query.period as string) || '30d';
        const days = period === '90d' ? 90 : 30;
        const data = await getCommunityMethodMix(days);
        res.json(data);
    } catch (error) {
        console.error('[admin] summary failed', error);
        res.status(500).json({ error: 'Failed to load summary' });
    }
});

router.get('/api/method-analysis/search-users', async (req, res) => {
    try {
        const q = (req.query.q as string) || '';
        if (!q.trim()) return res.json([]);
        const users = await searchTelegramUsers(q);
        res.json(users);
    } catch (error) {
        console.error('[admin] search users failed', error);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

router.get('/api/method-analysis/user', async (req, res) => {
    try {
        const userId = Number(req.query.userId);
        if (!userId) return res.status(400).json({ error: 'Missing userId' });
        const analysis30 = await getUserMethodMix(userId, 30);
        const analysis90 = await getUserMethodMix(userId, 90);
        res.json({ analysis30, analysis90 });
    } catch (error) {
        console.error('[admin] user analysis failed', error);
        res.status(500).json({ error: 'Failed to load user analysis' });
    }
});

export default router;
