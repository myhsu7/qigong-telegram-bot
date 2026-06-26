import cron from 'node-cron';
import { bot } from '../bot/telegram';
import { db } from '../db';
import moment from 'moment-timezone';
import { Lunar } from 'lunar-javascript';
import { env } from '../config/env';
import { getDailyWisdom } from '../content/wisdom';
import { getSolarTermGuide } from '../content/solarTerms';

const TIMEZONE = 'Asia/Taipei';

const buildReminderText = () => {
    const now = moment().tz(TIMEZONE);
    const lunar = Lunar.fromDate(now.toDate());
    const currentJieQi = lunar.getJieQi();
    const guide = currentJieQi ? getSolarTermGuide(currentJieQi) : null;

    if (guide) {
        return [
            `🌿 今日節氣：${currentJieQi}`,
            '',
            guide,
            '',
            '順時養生，順勢練功。今天也別忘了完成打卡喔！',
            '',
            '👉 請輸入 /checkin 開始今日打卡'
        ].join('\n');
    }

    return [
        '🌙 晚安！氣功時間到了！',
        '',
        getDailyWisdom(now),
        '',
        '大家今天練習了嗎？記得完成打卡，守住你的節奏！',
        '',
        '👉 請輸入 /checkin 開始今日打卡'
    ].join('\n');
};

export const sendDailyTelegramReminder = async () => {
    const text = buildReminderText();
    const { rows } = await db.query(
        `SELECT telegram_user_id
         FROM telegram_users
         ORDER BY telegram_user_id ASC`
    );

    let success = 0;
    for (const row of rows) {
        try {
            await bot.api.sendMessage(String(row.telegram_user_id), text);
            success += 1;
            await new Promise((resolve) => setTimeout(resolve, 50));
        } catch (error) {
            console.error('[telegram-reminder] failed to send to user', row.telegram_user_id, error);
        }
    }

    console.log(`[telegram-reminder] sent ${success}/${rows.length} reminders`);
    return { total: rows.length, success };
};

export const setupReminderCron = () => {
    if (!env.telegramReminderEnabled) {
        console.log('[telegram-reminder] disabled');
        return;
    }

    cron.schedule(`0 ${env.telegramReminderHour} * * *`, () => {
        console.log('[telegram-reminder] running daily reminder job...');
        sendDailyTelegramReminder().catch((error) => {
            console.error('[telegram-reminder] job failed', error);
        });
    }, {
        timezone: TIMEZONE
    });

    console.log(`[telegram-reminder] scheduled daily at ${env.telegramReminderHour}:00 ${TIMEZONE}`);
};
