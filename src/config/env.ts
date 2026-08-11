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

const parseBoundedInteger = (value: string | undefined, fallback: number, min: number, max: number) => {
    if (!value || !/^\d+$/.test(value)) return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

export const env = {
    port: parseInt(process.env.PORT || '3001', 10),
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
    publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
    telegramWebappUrl: process.env.TELEGRAM_WEBAPP_URL || '',
    telegramAchievementsWebappUrl: process.env.TELEGRAM_ACHIEVEMENTS_WEBAPP_URL || process.env.TELEGRAM_WEBAPP_URL?.replace('/checkin', '/achievements') || '',
    telegramLeaderboardWebappUrl: process.env.TELEGRAM_LEADERBOARD_WEBAPP_URL || process.env.TELEGRAM_WEBAPP_URL?.replace('/checkin', '/leaderboard') || '',
    telegramMethodAnalysisWebappUrl: process.env.TELEGRAM_METHOD_ANALYSIS_WEBAPP_URL || process.env.TELEGRAM_WEBAPP_URL?.replace('/checkin', '/method-analysis') || '',
    databaseUrl: process.env.DATABASE_URL || '',
    telegramWebappAuthDisabled: process.env.TELEGRAM_WEBAPP_AUTH_DISABLED === 'true',
    telegramWebappAuthMaxAgeSeconds: parseBoundedInteger(process.env.TELEGRAM_WEBAPP_AUTH_MAX_AGE_SECONDS, 3600, 60, 86400),
    telegramReminderEnabled: process.env.TELEGRAM_REMINDER_ENABLED === 'true',
    telegramReminderHour: parseBoundedInteger(process.env.TELEGRAM_REMINDER_HOUR, 20, 0, 23),
    telegramGroupOpsEnabled: process.env.TELEGRAM_GROUP_OPS_ENABLED === 'true',
    telegramGroupReminderHour: parseBoundedInteger(process.env.TELEGRAM_GROUP_REMINDER_HOUR, 20, 0, 23),
    telegramAdminUserIds: new Set(
        (process.env.TELEGRAM_ADMIN_USER_IDS || '')
            .split(',')
            .map((value) => value.trim())
            .filter((value) => /^\d+$/.test(value))
    ),
    localLlmEnabled: process.env.LOCAL_LLM_ENABLED === 'true',
    localLlmBaseUrl: (process.env.LOCAL_LLM_BASE_URL || '').replace(/\/$/, ''),
    localLlmApiKey: process.env.LOCAL_LLM_API_KEY || 'dummy',
    localLlmModel: process.env.LOCAL_LLM_MODEL || '',
    localLlmTimeoutMs: parseBoundedInteger(process.env.LOCAL_LLM_TIMEOUT_MS, 5000, 1, 7000),
    localLlmCriteria: parseBoundedInteger(process.env.LOCAL_LLM_CRITERIA, 30, 0, Number.MAX_SAFE_INTEGER)
};
