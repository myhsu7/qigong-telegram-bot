import express from 'express';
import path from 'path';
import { env } from './config/env';
import { telegramWebhook } from './bot/telegram';
import webappRoutes from './routes/webapp';
import apiRoutes from './routes/api';
import { setupReminderCron } from './services/reminders';

const app = express();

app.use(express.json());
app.use('/public', express.static(path.join(process.cwd(), 'dist', 'public')));

app.get('/', (req, res) => {
    res.json({
        ok: true,
        service: 'qigong-telegram-bot',
        webapp: '/webapp/checkin'
    });
});

app.post(`/telegram/webhook/${env.telegramWebhookSecret}`, telegramWebhook);
app.use('/webapp', webappRoutes);
app.use('/api/webapp', apiRoutes);

app.listen(env.port, () => {
    console.log(`[telegram-bot] server listening on port ${env.port}`);
    console.log(`[telegram-bot] webhook path: /telegram/webhook/${env.telegramWebhookSecret}`);
    console.log(`[telegram-bot] webapp path: /webapp/checkin`);
    setupReminderCron();
});
