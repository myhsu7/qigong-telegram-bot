import express from 'express';
import path from 'path';
import { env } from './config/env';
import { telegramWebhook, setupBotCommands } from './bot/telegram';
import webappRoutes from './routes/webapp';
import apiRoutes from './routes/api';
import { setupReminderCron } from './services/reminders';
import { requireAdminBasicAuth, requireTailscaleInternal } from './middleware/adminSecurity';
import adminRoutes from './routes/admin';

const app = express();

app.use(express.json());
app.use('/public', express.static(path.join(process.cwd(), 'dist', 'public')));

app.get('/', (req, res) => {
    res.json({
        ok: true,
        service: 'qigong-telegram-bot',
        webapp: '/telegram/webapp/checkin'
    });
});

app.post(`/telegram/webhook/${env.telegramWebhookSecret}`, telegramWebhook);
app.use('/telegram/webapp', webappRoutes);
app.use('/telegram/api/webapp', apiRoutes);
app.use('/telegram/admin', requireTailscaleInternal, requireAdminBasicAuth, adminRoutes);

app.listen(env.port, () => {
    console.log(`[telegram-bot] server listening on port ${env.port}`);
    console.log(`[telegram-bot] webhook path: /telegram/webhook/${env.telegramWebhookSecret}`);
    console.log(`[telegram-bot] webapp path: /telegram/webapp/checkin`);
    setupReminderCron();
    setupBotCommands();
});
