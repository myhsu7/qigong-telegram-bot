import { Router } from 'express';
import path from 'path';
import { getCommunityMethodMix, getUserMethodMix, searchTelegramUsers } from '../services/methodAnalysis';
import { getLeaderboard, getOverviewStats } from '../services/stats';

const router = Router();

router.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'public', 'admin', 'index.html'));
});

router.get('/leaderboard', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'public', 'admin', 'leaderboard.html'));
});

router.get('/method-analysis', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'public', 'admin', 'method-analysis.html'));
});

router.get('/api/overview', async (req, res) => {
    try {
        const period = (req.query.period as string) || 'week';
        if (!['week', 'month', 'quarter', 'year'].includes(period)) {
            return res.status(400).json({ error: 'Invalid period' });
        }
        const data = await getOverviewStats(period as 'week' | 'month' | 'quarter' | 'year');
        res.json(data);
    } catch (error) {
        console.error('[admin] overview failed', error);
        res.status(500).json({ error: 'Failed to load overview' });
    }
});

router.get('/api/leaderboard', async (req, res) => {
    try {
        const period = (req.query.period as string) || 'week';
        if (!['week', 'month', 'quarter', 'year'].includes(period)) {
            return res.status(400).json({ error: 'Invalid period' });
        }
        const data = await getLeaderboard(period as 'week' | 'month' | 'quarter' | 'year');
        res.json(data);
    } catch (error) {
        console.error('[admin] leaderboard failed', error);
        res.status(500).json({ error: 'Failed to load leaderboard' });
    }
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
