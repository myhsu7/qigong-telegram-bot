import cron from 'node-cron';
import moment from 'moment-timezone';
import { Lunar } from 'lunar-javascript';
import { db } from '../db';
import { env } from '../config/env';
import { getDailyWisdom } from '../content/wisdom';
import { getSolarTermGuide } from '../content/solarTerms';
import { getSanFuPeriod } from '../utils/sanfu';
import { getAdminLifetimeLeaderboard } from './stats';
import { getTelegramApi } from './telegramApi';

const TIMEZONE = 'Asia/Taipei';
const MAX_MESSAGE_LENGTH = 4096;

type GroupChat = {
    id: number;
    type: 'group' | 'supergroup';
    title?: string;
    username?: string;
};

type DispatchKind = 'daily' | 'resend' | 'broadcast';

class GroupDeliveryError extends Error {
    constructor(
        message: string,
        readonly attempts: number,
        readonly permanentGroupFailure: boolean,
        readonly retryable: boolean,
        readonly retryDelayMs: number,
        readonly targetChatId: number
    ) {
        super(message);
    }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorDetails = (error: unknown) => {
    const candidate = error as {
        error_code?: number;
        description?: string;
        parameters?: { retry_after?: number; migrate_to_chat_id?: number };
        message?: string;
    };
    const message = String(candidate?.description || candidate?.message || error || 'Unknown Telegram error').slice(0, 500);
    return {
        code: Number(candidate?.error_code || 0),
        message,
        retryAfter: Number(candidate?.parameters?.retry_after || 0),
        migrateToChatId: Number(candidate?.parameters?.migrate_to_chat_id || 0)
    };
};

const isNetworkError = (message: string) => [
    'fetch failed', 'ETIMEDOUT', 'ECONNRESET', 'socket hang up', 'Network request'
].some((part) => message.includes(part));

export const registerTelegramGroup = async (chat: GroupChat) => {
    await db.query(
        `INSERT INTO telegram_active_groups (chat_id, chat_type, title, username)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (chat_id) DO UPDATE SET
             chat_type = EXCLUDED.chat_type,
             title = EXCLUDED.title,
             username = EXCLUDED.username,
             is_active = TRUE,
             left_at = NULL,
             updated_at = CURRENT_TIMESTAMP,
             last_error = NULL`,
        [chat.id, chat.type, chat.title || null, chat.username || null]
    );
};

export const deactivateTelegramGroup = async (chatId: number, reason?: string) => {
    await db.query(
        `UPDATE telegram_active_groups
         SET is_active = FALSE,
             left_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP,
             last_error = $2
         WHERE chat_id = $1`,
        [chatId, reason?.slice(0, 500) || null]
    );
};

export const migrateTelegramGroup = async (oldChatId: number, newChatId: number) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        await client.query(
            `INSERT INTO telegram_active_groups (chat_id, chat_type, title, username, is_active, joined_at)
             VALUES (
                 $2,
                 'supergroup',
                 (SELECT title FROM telegram_active_groups WHERE chat_id = $1),
                 (SELECT username FROM telegram_active_groups WHERE chat_id = $1),
                 TRUE,
                 COALESCE((SELECT joined_at FROM telegram_active_groups WHERE chat_id = $1), CURRENT_TIMESTAMP)
             )
             ON CONFLICT (chat_id) DO UPDATE SET
                 chat_type = 'supergroup',
                 title = COALESCE(EXCLUDED.title, telegram_active_groups.title),
                 username = COALESCE(EXCLUDED.username, telegram_active_groups.username),
                 is_active = TRUE,
                 left_at = NULL,
                 updated_at = CURRENT_TIMESTAMP,
                 last_error = NULL`,
            [oldChatId, newChatId]
        );
        await client.query(
            `INSERT INTO telegram_group_deliveries
                (dispatch_id, chat_id, status, attempts, last_error, next_attempt_at, sent_at)
             SELECT dispatch_id, $2, status, attempts, last_error, next_attempt_at, sent_at
             FROM telegram_group_deliveries
             WHERE chat_id = $1
             ON CONFLICT (dispatch_id, chat_id) DO UPDATE SET
                 status = CASE
                     WHEN telegram_group_deliveries.status = 'sent' OR EXCLUDED.status = 'sent' THEN 'sent'
                     WHEN telegram_group_deliveries.status = 'pending' OR EXCLUDED.status = 'pending' THEN 'pending'
                     ELSE 'permanent_failed'
                 END,
                 attempts = GREATEST(telegram_group_deliveries.attempts, EXCLUDED.attempts),
                 last_error = COALESCE(EXCLUDED.last_error, telegram_group_deliveries.last_error),
                 next_attempt_at = LEAST(telegram_group_deliveries.next_attempt_at, EXCLUDED.next_attempt_at),
                 sent_at = COALESCE(telegram_group_deliveries.sent_at, EXCLUDED.sent_at)`,
            [oldChatId, newChatId]
        );
        await client.query('DELETE FROM telegram_group_deliveries WHERE chat_id = $1', [oldChatId]);
        await client.query(
            `UPDATE telegram_active_groups
             SET is_active = FALSE, left_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
                 last_error = $2
             WHERE chat_id = $1`,
            [oldChatId, `Migrated to ${newChatId}`]
        );
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const listTelegramGroups = async () => {
    const { rows } = await db.query(
        `SELECT chat_id, chat_type, title, username, joined_at
         FROM telegram_active_groups
         WHERE is_active = TRUE
         ORDER BY joined_at DESC, chat_id ASC`
    );
    return rows.map((row) => ({
        chatId: Number(row.chat_id),
        chatType: row.chat_type,
        title: row.title || row.username || `Group ${row.chat_id}`,
        joinedAt: row.joined_at
    }));
};

const getJieQiDate = (year: number, name: string) => {
    const value = Lunar.fromDate(new Date(year, 6, 1)).getJieQiTable()[name];
    return value ? moment.tz(value.toYmd(), 'YYYY-MM-DD', TIMEZONE) : null;
};

const isWinterChallengePeriod = (now: moment.Moment) => {
    const candidates = [getJieQiDate(now.year(), 'DONG_ZHI'), getJieQiDate(now.year() - 1, 'DONG_ZHI')]
        .filter((value): value is moment.Moment => Boolean(value && value.isSameOrBefore(now, 'day')))
        .sort((a, b) => b.valueOf() - a.valueOf());
    if (!candidates[0]) return false;
    const daysSince = now.clone().startOf('day').diff(candidates[0].clone().startOf('day'), 'days');
    return daysSince >= 0 && daysSince <= 27;
};

const getBadgeSpotlight = async (now: moment.Moment) => {
    const { rows } = await db.query(
        `SELECT id, name, emoji, description
         FROM telegram_badges
         ORDER BY
             CASE category
                 WHEN 'STREAK' THEN 1 WHEN 'TOTAL' THEN 2 WHEN 'TIME_BASED' THEN 3
                 WHEN 'SEASONAL' THEN 4 WHEN 'COMBO' THEN 5 WHEN 'METHOD_DAYS' THEN 6 ELSE 99
             END,
             id ASC`
    );
    if (rows.length === 0) return '🏅 本期挑戰成就\n暫無成就資料';
    const badge = rows[Math.floor((now.dayOfYear() - 1) / 3) % rows.length];
    return ['🏅 本期挑戰成就', `${badge.emoji || '🏅'} ${badge.name}`, badge.description, '', '完成這項挑戰，替你的修練留下一枚勳章。'].join('\n');
};

const getDailyLeaders = async () => {
    const leaders = (await getAdminLifetimeLeaderboard(1, 10)).rows.filter((row) => row.currentStreak > 0);
    if (leaders.length === 0) return '🔥 每日精進榜：\n大家快來打卡，開啟你的練功連勝紀錄吧！';
    const selected = [...leaders]
        .map((row) => ({ row, key: Math.random() }))
        .sort((a, b) => a.key - b.key)
        .slice(0, 3)
        .map(({ row }) => `• ${row.displayName} - 連續 ${row.currentStreak} 天`);
    return `🔥 每日精進榜：\n${selected.join('\n')}`;
};

export const createTelegramGroupReminderText = async (mode: 'daily' | 'resend' = 'daily') => {
    if (mode === 'resend') {
        return [
            '📣 補發提醒：還沒打卡的同學，現在就來完成！',
            '',
            '每天一點點，身心更穩定。今天完成，就能守住你的習慣與連勝。',
            '',
            '👉 請私訊 Bot，輸入 /checkin 開始今日打卡'
        ].join('\n');
    }

    const now = moment().tz(TIMEZONE);
    const lunar = Lunar.fromDate(now.toDate());
    const currentJieQi = lunar.getJieQi();
    const solarGuide = currentJieQi ? getSolarTermGuide(currentJieQi) : null;
    const sanFu = getSanFuPeriod(now.year());
    const greeting = now.hour() >= 5 && now.hour() < 11 ? '☀️ 早安！' : now.hour() < 17 ? '🌤 午安！' : '🌙 晚安！';
    const [badge, leaders] = await Promise.all([getBadgeSpotlight(now), getDailyLeaders()]);
    let intro: string;
    if (sanFu && now.isBetween(sanFu.start, sanFu.end, 'day', '[]')) {
        intro = `${greeting} 夏練三伏進行中！\n\n今年三伏期間共 ${sanFu?.totalDays || '多'} 天，養陽固本；不求暴增，只求日進。`;
    } else if (isWinterChallengePeriod(now)) {
        intro = `${greeting} 冬練三九進行中！\n\n冬藏養精，重在恆心。今晚一起穩定練習龜壽功。`;
    } else if (solarGuide) {
        intro = `${greeting} 今日節氣：${currentJieQi}\n\n${solarGuide}\n\n順時養生，順勢練功。`;
    } else {
        intro = `${greeting} 氣功時間到了！\n\n${getDailyWisdom(now)}\n\n大家今天練習了嗎？記得完成打卡，守住你的節奏！`;
    }

    return [intro, badge, leaders, '👉 請私訊 Bot，輸入 /checkin 開始今日打卡'].join('\n\n');
};

const sendGroupMessageWithRetry = async (chatId: number, text: string, maxAttempts = 3) => {
    let targetChatId = chatId;
    let lastMessage = 'Unknown Telegram error';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await getTelegramApi().sendMessage(targetChatId, text);
            return { attempts: attempt, targetChatId };
        } catch (error) {
            const details = getErrorDetails(error);
            lastMessage = details.message;
            if (details.migrateToChatId) {
                try {
                    await migrateTelegramGroup(targetChatId, details.migrateToChatId);
                } catch (migrationError) {
                    throw new GroupDeliveryError(
                        `Failed to persist Telegram group migration: ${getErrorDetails(migrationError).message}`,
                        attempt,
                        false,
                        true,
                        60_000,
                        targetChatId
                    );
                }
                targetChatId = details.migrateToChatId;
                continue;
            }
            const permanentGroupFailure = details.code === 403
                || (details.code === 400 && /chat not found|bot is not a member|group chat was upgraded/i.test(details.message));
            const retryable = details.code === 429 || details.code >= 500 || isNetworkError(details.message);
            if (permanentGroupFailure || !retryable || attempt === maxAttempts) {
                const retryDelayMs = details.retryAfter > 0
                    ? details.retryAfter * 1000
                    : attempt === 1 ? 500 : 1500;
                throw new GroupDeliveryError(lastMessage, attempt, permanentGroupFailure, retryable, retryDelayMs, targetChatId);
            }
            const delay = details.retryAfter > 0
                ? details.retryAfter * 1000
                : attempt === 1 ? 500 : 1500;
            await sleep(delay);
        }
    }
    throw new GroupDeliveryError(lastMessage, maxAttempts, false, true, 60_000, targetChatId);
};

const ensureOutboundEnabled = () => {
    if (!env.telegramGroupOpsEnabled) throw new Error('Telegram group operations are disabled');
};

const createDispatch = async (dispatchKey: string, kind: DispatchKind, text: string, requestedBy?: number) => {
    ensureOutboundEnabled();
    if (!text.trim()) throw new Error('Message cannot be empty');
    if (text.length > MAX_MESSAGE_LENGTH) throw new Error(`Message exceeds Telegram ${MAX_MESSAGE_LENGTH} character limit`);
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const insert = await client.query(
            `INSERT INTO telegram_group_dispatches (dispatch_key, kind, message_text, requested_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (dispatch_key) DO NOTHING
             RETURNING id`,
            [dispatchKey, kind, text, requestedBy || null]
        );
        const dispatchId = insert.rows[0]?.id || (
            await client.query('SELECT id FROM telegram_group_dispatches WHERE dispatch_key = $1', [dispatchKey])
        ).rows[0]?.id;
        if (!dispatchId) throw new Error('Failed to create group dispatch');
        await client.query(
            `INSERT INTO telegram_group_deliveries (dispatch_id, chat_id)
             SELECT $1, chat_id FROM telegram_active_groups WHERE is_active = TRUE
             ON CONFLICT (dispatch_id, chat_id) DO NOTHING`,
            [dispatchId]
        );
        await client.query('COMMIT');
        return Number(dispatchId);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const processDispatch = async (dispatchId: number) => {
    ensureOutboundEnabled();
    const lockClient = await db.getClient();
    try {
        const lockResult = await lockClient.query('SELECT pg_try_advisory_lock($1) AS locked', [dispatchId]);
        if (!lockResult.rows[0]?.locked) return { total: 0, success: 0, failed: 0, skipped: true };

        await lockClient.query(
            `UPDATE telegram_group_deliveries d
             SET status = 'permanent_failed', next_attempt_at = NULL,
                 last_error = COALESCE(d.last_error, 'Group is inactive')
             FROM telegram_active_groups g
             WHERE d.dispatch_id = $1 AND d.chat_id = g.chat_id
               AND d.status = 'pending' AND g.is_active = FALSE`,
            [dispatchId]
        );
        const dispatchRes = await lockClient.query('SELECT message_text FROM telegram_group_dispatches WHERE id = $1', [dispatchId]);
        if (!dispatchRes.rows[0]) throw new Error('Group dispatch not found');
        const { rows } = await lockClient.query(
            `SELECT d.chat_id, d.attempts
             FROM telegram_group_deliveries d
             JOIN telegram_active_groups g ON g.chat_id = d.chat_id
             WHERE d.dispatch_id = $1
               AND d.status = 'pending'
               AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= CURRENT_TIMESTAMP)
               AND g.is_active = TRUE
             ORDER BY d.chat_id ASC`,
            [dispatchId]
        );
        let success = 0;
        let failed = 0;
        let pending = 0;
        for (const row of rows) {
            const chatId = Number(row.chat_id);
            const previousAttempts = Number(row.attempts || 0);
            try {
                const sent = await sendGroupMessageWithRetry(chatId, dispatchRes.rows[0].message_text, previousAttempts >= 6 ? 1 : 3);
                await lockClient.query(
                    `UPDATE telegram_group_deliveries
                     SET status = 'sent', attempts = attempts + $3, sent_at = CURRENT_TIMESTAMP,
                         last_error = NULL, next_attempt_at = NULL
                     WHERE dispatch_id = $1 AND chat_id = $2`,
                    [dispatchId, sent.targetChatId, sent.attempts]
                );
                await lockClient.query(
                    `UPDATE telegram_active_groups SET last_sent_at = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE chat_id = $1`,
                    [sent.targetChatId]
                );
                success += 1;
            } catch (error) {
                const deliveryError = error instanceof GroupDeliveryError
                    ? error
                    : new GroupDeliveryError(getErrorDetails(error).message, 1, false, false, 0, chatId);
                const shouldRetry = deliveryError.retryable && previousAttempts + deliveryError.attempts < 9;
                await lockClient.query(
                    `UPDATE telegram_group_deliveries
                     SET status = $3::varchar,
                         attempts = attempts + $4,
                         last_error = $5,
                         next_attempt_at = CASE
                             WHEN $3::varchar = 'pending' THEN CURRENT_TIMESTAMP + ($6::int * INTERVAL '1 millisecond')
                             ELSE NULL
                         END
                     WHERE dispatch_id = $1 AND chat_id = $2`,
                    [dispatchId, deliveryError.targetChatId, shouldRetry ? 'pending' : 'permanent_failed', deliveryError.attempts, deliveryError.message, deliveryError.retryDelayMs]
                );
                await lockClient.query(
                    `UPDATE telegram_active_groups SET last_error = $2, updated_at = CURRENT_TIMESTAMP WHERE chat_id = $1`,
                    [deliveryError.targetChatId, deliveryError.message]
                );
                if (deliveryError.permanentGroupFailure) {
                    await lockClient.query(
                        `UPDATE telegram_active_groups
                         SET is_active = FALSE, left_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, last_error = $2
                         WHERE chat_id = $1`,
                        [deliveryError.targetChatId, deliveryError.message]
                    );
                }
                if (shouldRetry) pending += 1;
                else failed += 1;
                console.error(`[telegram-group] delivery failed chat=${chatId} dispatch=${dispatchId}`, deliveryError);
            }
            await sleep(50);
        }
        return { total: rows.length, success, failed, pending, skipped: false };
    } finally {
        await lockClient.query('SELECT pg_advisory_unlock($1)', [dispatchId]).catch(() => undefined);
        lockClient.release();
    }
};

export const sendDailyTelegramGroupReminder = async () => {
    const date = moment().tz(TIMEZONE).format('YYYY-MM-DD');
    const dispatchId = await createDispatch(`daily:${date}`, 'daily', await createTelegramGroupReminderText());
    return processDispatch(dispatchId);
};

export const sendTelegramGroupReminderResend = async (updateId: number, requestedBy: number) => {
    const dispatchId = await enqueueTelegramGroupReminderResend(updateId, requestedBy);
    return processDispatch(dispatchId);
};

export const enqueueTelegramGroupReminderResend = async (updateId: number, requestedBy: number) => {
    return createDispatch(
        `admin:${updateId}:resend`,
        'resend',
        await createTelegramGroupReminderText('resend'),
        requestedBy
    );
};

export const sendTelegramGroupBroadcast = async (updateId: number, text: string, requestedBy: number) => {
    const dispatchId = await enqueueTelegramGroupBroadcast(updateId, text, requestedBy);
    return processDispatch(dispatchId);
};

export const enqueueTelegramGroupBroadcast = async (updateId: number, text: string, requestedBy: number) => {
    return createDispatch(`admin:${updateId}:broadcast`, 'broadcast', text, requestedBy);
};

export const processTelegramGroupDispatch = processDispatch;

export const resumePendingTelegramGroupDispatches = async () => {
    if (!env.telegramGroupOpsEnabled) return;
    const { rows } = await db.query(
        `SELECT DISTINCT dispatch_id
         FROM telegram_group_deliveries
         WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)
         ORDER BY dispatch_id ASC`
    );
    for (const row of rows) await processDispatch(Number(row.dispatch_id));
};

export const catchUpTodayTelegramGroupReminder = async () => {
    if (!env.telegramGroupOpsEnabled) return null;
    const now = moment().tz(TIMEZONE);
    if (now.hour() < env.telegramGroupReminderHour) return null;
    return sendDailyTelegramGroupReminder();
};

export const setupTelegramGroupReminderCron = () => {
    if (!env.telegramGroupOpsEnabled) {
        console.log('[telegram-group] outbound operations disabled');
        return;
    }
    cron.schedule(`0 ${env.telegramGroupReminderHour} * * *`, () => {
        sendDailyTelegramGroupReminder().catch((error) => console.error('[telegram-group] daily reminder failed', error));
    }, { timezone: TIMEZONE });
    cron.schedule('* * * * *', () => {
        resumePendingTelegramGroupDispatches().catch((error) => console.error('[telegram-group] pending retry worker failed', error));
    }, { timezone: TIMEZONE });
    catchUpTodayTelegramGroupReminder().catch((error) => console.error('[telegram-group] daily reminder catch-up failed', error));
    console.log(`[telegram-group] daily reminder scheduled at ${String(env.telegramGroupReminderHour).padStart(2, '0')}:00 ${TIMEZONE}`);
};
