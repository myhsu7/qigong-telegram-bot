import { Request, Router } from 'express';
import path from 'path';
import { getCommunityMethodMix, getUserMethodMix, getUserPracticeJournal, searchTelegramUsers } from '../services/methodAnalysis';
import { getLeaderboard, getOverviewStats, getTodayCheckedInUsers, getTodayPendingUsers } from '../services/stats';

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
        const [analysis30, analysis90, journal] = await Promise.all([
            getUserMethodMix(userId, 30),
            getUserMethodMix(userId, 90),
            getUserPracticeJournal(userId)
        ]);
        res.json({ analysis30, analysis90, journal });
    } catch (error) {
        console.error('[admin] user analysis failed', error);
        res.status(500).json({ error: 'Failed to load user analysis' });
    }
});

const parsePage = (req: Request) => {
    const page = parseInt((req.query.page as string) || '1', 10);
    return Number.isFinite(page) && page > 0 ? page : 1;
};

const parseLimit = (req: Request) => {
    const limit = parseInt((req.query.limit as string) || '20', 10);
    return Number.isFinite(limit) && limit > 0 && limit <= 100 ? limit : 20;
};

router.get('/api/today-checkins', async (req, res) => {
    try {
        const data = await getTodayCheckedInUsers(parsePage(req), parseLimit(req));
        res.json(data);
    } catch (error) {
        console.error('[admin] today-checkins failed', error);
        res.status(500).json({ error: 'Failed to load today checkins' });
    }
});

router.get('/api/today-pending', async (req, res) => {
    try {
        const data = await getTodayPendingUsers(parsePage(req), parseLimit(req));
        res.json(data);
    } catch (error) {
        console.error('[admin] today-pending failed', error);
        res.status(500).json({ error: 'Failed to load today pending' });
    }
});

export default router;
