import express from 'express';
import path from 'path';
import { env } from './config/env';
import { bot, telegramWebhook, setupBotCommands } from './bot/telegram';
import webappRoutes from './routes/webapp';
import apiRoutes from './routes/api';
import { setupReminderCron } from './services/reminders';
import { requireAdminBasicAuth, requireTailscaleInternal } from './middleware/adminSecurity';
import adminRoutes from './routes/admin';
import { setupErrorLogging } from './logger';
import { configureTelegramApi } from './services/telegramApi';
import { resumePendingTelegramGroupDispatches, setupTelegramGroupReminderCron } from './services/groupOperations';
import { setupSanFuBadgeReconciliation } from './services/sanfuBadges';
import { configureNodeNetwork } from './network';

setupErrorLogging('qigong-telegram-bot');
const networkConfig = configureNodeNetwork();
console.log(`[network] auto-select family attempt timeout ${networkConfig.timeoutMs}ms (previous ${networkConfig.previousTimeoutMs}ms)`);
configureTelegramApi(bot.api);
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
    setupTelegramGroupReminderCron();
    setupSanFuBadgeReconciliation();
    resumePendingTelegramGroupDispatches().catch((error) => console.error('[telegram-group] failed to resume pending dispatches', error));
    setupBotCommands();
});
