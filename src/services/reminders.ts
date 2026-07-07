import cron from 'node-cron';
import { bot } from '../bot/telegram';
import { db } from '../db';
import moment from 'moment-timezone';
import { Lunar } from 'lunar-javascript';
import { env } from '../config/env';
import { getDailyWisdom } from '../content/wisdom';
import { getSolarTermGuide } from '../content/solarTerms';

const TIMEZONE = 'Asia/Taipei';

export interface TelegramReminderSettings {
    reminderEnabled: boolean;
    reminderHour: number;
    reminderTimezone: string;
}

interface ReminderRecipient {
    telegramUserId: number;
    reminderTimezone: string;
}

type ReminderSendErrorKind = 'network' | 'forbidden' | 'bad-request' | 'unknown';

const getGreeting = (now: moment.Moment) => {
    const hour = now.hour();
    if (hour >= 5 && hour < 11) return '☀️ 早安！';
    if (hour >= 11 && hour < 17) return '🌤 午安！';
    return '🌙 晚安！';
};

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
};

const classifyReminderSendError = (error: unknown): ReminderSendErrorKind => {
    const message = getErrorMessage(error);
    if (
        message.includes("Network request for 'sendMessage' failed")
        || message.includes('fetch failed')
        || message.includes('ETIMEDOUT')
        || message.includes('ECONNRESET')
        || message.includes('socket hang up')
    ) {
        return 'network';
    }
    if (message.includes('Forbidden') || message.includes('bot was blocked by the user')) {
        return 'forbidden';
    }
    if (message.includes('Bad Request') || message.includes('chat not found')) {
        return 'bad-request';
    }
    return 'unknown';
};

const isRetryableReminderSendError = (error: unknown) => classifyReminderSendError(error) === 'network';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sendTelegramReminderMessageWithRetry = async (recipient: ReminderRecipient, text: string, maxAttempts = 3) => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await bot.api.sendMessage(String(recipient.telegramUserId), text);
            if (attempt > 1) {
                console.log(`[telegram-reminder] send succeeded after retry user=${recipient.telegramUserId} timezone=${recipient.reminderTimezone} attempt=${attempt}/${maxAttempts}`);
            }
            return;
        } catch (error) {
            lastError = error;
            const kind = classifyReminderSendError(error);
            console.error(`[telegram-reminder] send failed user=${recipient.telegramUserId} timezone=${recipient.reminderTimezone} attempt=${attempt}/${maxAttempts} kind=${kind}`, error);

            if (attempt === maxAttempts || !isRetryableReminderSendError(error)) {
                throw error;
            }

            await sleep(attempt === 1 ? 300 : 800);
        }
    }

    throw lastError;
};

const buildReminderText = (reminderTimezone: string) => {
    const now = moment().tz(reminderTimezone);
    const lunar = Lunar.fromDate(now.toDate());
    const currentJieQi = lunar.getJieQi();
    const guide = currentJieQi ? getSolarTermGuide(currentJieQi) : null;
    const greeting = getGreeting(now);

    if (guide) {
        return [
            `${greeting} 今日節氣：${currentJieQi}`,
            '',
            guide,
            '',
            '順時養生，順勢練功。今天也別忘了完成打卡喔！',
            '',
            '👉 請輸入 /checkin 開始今日打卡'
        ].join('\n');
    }

    return [
        `${greeting} 氣功時間到了！`,
        '',
        getDailyWisdom(now),
        '',
        '大家今天練習了嗎？記得完成打卡，守住你的節奏！',
        '',
        '👉 請輸入 /checkin 開始今日打卡'
    ].join('\n');
};

const getReminderRecipients = async () => {
    const { rows } = await db.query(
        `SELECT telegram_user_id,
                COALESCE(reminder_timezone, $1) AS reminder_timezone
         FROM telegram_users
         WHERE COALESCE(reminder_enabled, TRUE) = TRUE
           AND EXTRACT(HOUR FROM (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(reminder_timezone, $1)))::int = COALESCE(reminder_hour, $2)
         ORDER BY telegram_user_id ASC`,
        [TIMEZONE, env.telegramReminderHour]
    );

    return rows
        .map((row) => ({
            telegramUserId: Number(row.telegram_user_id),
            reminderTimezone: row.reminder_timezone || TIMEZONE
        }))
        .filter((row) => Number.isFinite(row.telegramUserId));
};

const sendReminderToTelegramUsers = async (recipients: ReminderRecipient[]) => {
    
    let success = 0;
    for (const recipient of recipients) {
        try {
            await sendTelegramReminderMessageWithRetry(recipient, buildReminderText(recipient.reminderTimezone));
            success += 1;
            await new Promise((resolve) => setTimeout(resolve, 50));
        } catch (error) {
            console.error('[telegram-reminder] failed to send to user', recipient.telegramUserId, error);
        }
    }

    console.log(`[telegram-reminder] sent ${success}/${recipients.length} reminders`);
    return { total: recipients.length, success };
};

export const getTelegramReminderSettings = async (telegramUserId: number): Promise<TelegramReminderSettings> => {
    const { rows } = await db.query(
        `SELECT COALESCE(reminder_enabled, TRUE) AS reminder_enabled,
                COALESCE(reminder_hour, $2) AS reminder_hour,
                COALESCE(reminder_timezone, $3) AS reminder_timezone
         FROM telegram_users
         WHERE telegram_user_id = $1`,
        [telegramUserId, env.telegramReminderHour, TIMEZONE]
    );

    if (rows.length === 0) {
        return {
            reminderEnabled: true,
            reminderHour: env.telegramReminderHour,
            reminderTimezone: TIMEZONE
        };
    }

    return {
        reminderEnabled: rows[0].reminder_enabled,
        reminderHour: Number(rows[0].reminder_hour),
        reminderTimezone: rows[0].reminder_timezone
    };
};

export const updateTelegramReminderSettings = async (
    telegramUserId: number,
    updates: Partial<TelegramReminderSettings>
): Promise<TelegramReminderSettings> => {
    const current = await getTelegramReminderSettings(telegramUserId);
    const next = {
        reminderEnabled: updates.reminderEnabled ?? current.reminderEnabled,
        reminderHour: updates.reminderHour ?? current.reminderHour,
        reminderTimezone: updates.reminderTimezone ?? current.reminderTimezone
    };

    await db.query(
        `UPDATE telegram_users
         SET reminder_enabled = $2,
             reminder_hour = $3,
             reminder_timezone = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE telegram_user_id = $1`,
        [telegramUserId, next.reminderEnabled, next.reminderHour, next.reminderTimezone]
    );

    return next;
};

export const sendDailyTelegramReminder = async () => {
    return sendReminderToTelegramUsers(await getReminderRecipients());
};

export const sendTelegramReminderPreview = async (telegramUserId: number) => {
    const settings = await getTelegramReminderSettings(telegramUserId);
    return sendReminderToTelegramUsers([{ telegramUserId, reminderTimezone: settings.reminderTimezone }]);
};

export const setupReminderCron = () => {
    if (!env.telegramReminderEnabled) {
        console.log('[telegram-reminder] disabled');
        return;
    }

    cron.schedule('0 * * * *', () => {
        console.log('[telegram-reminder] running daily reminder job...');
        sendDailyTelegramReminder().catch((error) => {
            console.error('[telegram-reminder] job failed', error);
        });
    }, {
        timezone: TIMEZONE
    });

    console.log(`[telegram-reminder] scheduled hourly routing by user reminder settings (${TIMEZONE} scheduler)`);
};
