import { Request, Response, NextFunction } from 'express';
import auth from 'basic-auth';

export const requireAdminBasicAuth = (req: Request, res: Response, next: NextFunction) => {
    const user = auth(req);
    const adminUser = process.env.ADMIN_DASH_USER;
    const adminPass = process.env.ADMIN_DASH_PASS;

    if (!adminUser || !adminPass) {
        return res.status(500).send('Admin credentials not configured');
    }

    if (!user || user.name !== adminUser || user.pass !== adminPass) {
        res.set('WWW-Authenticate', 'Basic realm="Telegram Admin Dashboard"');
        return res.status(401).send('Unauthorized');
    }

    next();
};

export const requireTailscaleInternal = (req: Request, res: Response, next: NextFunction) => {
    const rawIp = req.ip || req.connection.remoteAddress || '';
    let ip = rawIp;
    if (ip.startsWith('::ffff:')) ip = ip.substring(7);
    const allowedPrefix = process.env.ADMIN_ALLOWED_IP_PREFIX || '100.';
    if (ip.startsWith(allowedPrefix) || ip === '127.0.0.1' || ip === '::1') {
        return next();
    }
    return res.status(403).send('Forbidden: internal access only');
};
