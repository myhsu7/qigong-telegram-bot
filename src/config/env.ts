import * as dotenv from 'dotenv';

dotenv.config();

const required = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_WEBHOOK_SECRET',
    'PUBLIC_BASE_URL',
    'TELEGRAM_WEBAPP_URL'
] as const;

for (const key of required) {
    if (!process.env[key]) {
        console.warn(`[env] Missing ${key}. Some features will not work until it is configured.`);
    }
}

export const env = {
    port: parseInt(process.env.PORT || '3001', 10),
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
    publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
    telegramWebappUrl: process.env.TELEGRAM_WEBAPP_URL || ''
};
