import { Router } from 'express';
import path from 'path';

const router = Router();

router.get('/checkin', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'public', 'webapp', 'index.html'));
});

router.get('/achievements', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'public', 'webapp', 'achievements.html'));
});

export default router;
