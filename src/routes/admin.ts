import { Request, Router } from 'express';
import path from 'path';
import moment from 'moment-timezone';
import { buildMethodReview, getCommunityMethodMix, getCommunityPracticeJournal, getUserMethodMix, getUserPracticeJournal, searchTelegramUsers } from '../services/methodAnalysis';
import { getAdminBadgeAchievements } from '../services/badges';
import { AdminLeaderboardLimit, getAdminLifetimeLeaderboard, getAdminPeriodStreaks, getCheckedInUsersByDate, getOverviewStats, getPendingUsersByDate } from '../services/stats';
import { generateMethodReviewWithLlm } from '../services/methodReviewLlm';

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

router.get('/achievements', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'public', 'admin', 'achievements.html'));
});

router.get('/journals', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'public', 'admin', 'journals.html'));
});

router.get('/api/overview', async (req, res) => {
    try {
        const period = (req.query.period as string) || 'week';
        if (!['week', 'month', 'quarter', 'year'].includes(period)) {
            return res.status(400).json({ error: 'Invalid period' });
        }
        const date = typeof req.query.date === 'string' ? req.query.date : undefined;
        const data = await getOverviewStats(period as 'week' | 'month' | 'quarter' | 'year', date);
        res.json(data);
    } catch (error) {
        console.error('[admin] overview failed', error);
        if (error instanceof Error && error.message.startsWith('Invalid date')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to load overview' });
    }
});

router.get('/api/leaderboard', async (req, res) => {
    try {
        const period = (req.query.period as string) || 'week';
        if (!['week', 'month', 'quarter', 'year'].includes(period)) {
            return res.status(400).json({ error: 'Invalid period' });
        }
        const requestedLimit = Number(req.query.limit);
        const streakLimit: AdminLeaderboardLimit = requestedLimit === 20 || requestedLimit === 30 ? requestedLimit : 10;
        const [totals, streaks] = await Promise.all([
            getAdminLifetimeLeaderboard(parsePage(req), 20),
            getAdminPeriodStreaks(period as 'week' | 'month' | 'quarter' | 'year', streakLimit)
        ]);
        res.json({ totals: totals.rows, totalsPage: totals, streaks, streakLimit });
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
        const reviewText = await generateMethodReviewWithLlm(analysis30, buildMethodReview(analysis30), userId);
        res.json({ analysis30, analysis90, reviewText, journal });
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

const parseTargetDate = (req: Request) => {
    const value = typeof req.query.date === 'string'
        ? req.query.date
        : moment().tz('Asia/Taipei').format('YYYY-MM-DD');
    const parsed = moment.tz(value, 'YYYY-MM-DD', true, 'Asia/Taipei');
    if (!parsed.isValid()) throw new Error('Invalid date. Use YYYY-MM-DD.');
    return parsed.format('YYYY-MM-DD');
};

router.get('/api/today-checkins', async (req, res) => {
    try {
        const data = await getCheckedInUsersByDate(parseTargetDate(req), parsePage(req), parseLimit(req));
        res.json(data);
    } catch (error) {
        console.error('[admin] today-checkins failed', error);
        if (error instanceof Error && error.message.startsWith('Invalid date')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to load today checkins' });
    }
});

router.get('/api/today-pending', async (req, res) => {
    try {
        const data = await getPendingUsersByDate(parseTargetDate(req), parsePage(req), parseLimit(req));
        res.json(data);
    } catch (error) {
        console.error('[admin] today-pending failed', error);
        if (error instanceof Error && error.message.startsWith('Invalid date')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to load today pending' });
    }
});

router.get('/api/achievements', async (_req, res) => {
    try {
        res.json({ badges: await getAdminBadgeAchievements() });
    } catch (error) {
        console.error('[admin] achievements failed', error);
        res.status(500).json({ error: 'Failed to load achievements' });
    }
});

router.get('/api/journals', async (req, res) => {
    try {
        res.json(await getCommunityPracticeJournal(parsePage(req), parseLimit(req)));
    } catch (error) {
        console.error('[admin] journals failed', error);
        res.status(500).json({ error: 'Failed to load journals' });
    }
});

export default router;
