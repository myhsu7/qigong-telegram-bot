import { Router } from 'express';
import path from 'path';

const router = Router();

router.get('/checkin', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'public', 'webapp', 'index.html'));
});

router.get('/achievements', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'public', 'webapp', 'achievements.html'));
});

router.get('/leaderboard', (_req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'public', 'webapp', 'leaderboard.html'));
});

router.get('/method-analysis', (_req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'public', 'webapp', 'method-analysis.html'));
});

export default router;
