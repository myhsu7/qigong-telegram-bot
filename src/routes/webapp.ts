import { Router } from 'express';
import path from 'path';

const router = Router();

router.get('/checkin', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'public', 'webapp', 'index.html'));
});

export default router;
