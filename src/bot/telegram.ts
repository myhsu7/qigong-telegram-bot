import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { upsertTelegramUser } from '../services/checkin';
import { buildBadgesMessage, buildEnhancedUserStatsMessage, buildLeaderboardMessage, getUserStats } from '../services/stats';
import { buildMethodMixMessage, buildMethodReview, getUserMethodMix } from '../services/methodAnalysis';
import { generateMethodReviewWithLlm } from '../services/methodReviewLlm';
import { getTelegramReminderSettings, sendTelegramReminderPreview, updateTelegramReminderSettings } from '../services/reminders';
import { buildWebAppCheckinSummary } from '../services/chatSummary';
import moment from 'moment-timezone';
import {
    createTelegramGroupReminderText,
    deactivateTelegramGroup,
    enqueueTelegramGroupBroadcast,
    enqueueTelegramGroupReminderResend,
    listTelegramGroups,
    migrateTelegramGroup,
    processTelegramGroupDispatch,
    registerTelegramGroup,
} from '../services/groupOperations';
import { serializeError } from '../errorDetails';

export const bot = new Bot(env.telegramBotToken);

const formatReminderTime = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

const buildReminderSettingsMessage = (settings: {
    reminderEnabled: boolean;
    reminderHour: number;
    reminderTimezone: string;
}) => {
    return [
        '🔔 你的打卡提醒設定',
        '',
        `狀態：${settings.reminderEnabled ? '已開啟' : '已關閉'}`,
        `時間：${formatReminderTime(settings.reminderHour)}`,
        `時區：${settings.reminderTimezone}`,
        '',
        '可用指令：',
        '- `/remind`：查看目前設定',
        '- `/remind 21`：設為 21:00',
        '- `/remind on`：開啟提醒',
        '- `/remind off`：關閉提醒',
        '- `/remind tz Asia/Taipei`：設定時區'
    ].join('\n');
};

const ensureUser = async (ctx: any) => {
    if (!ctx.from) return;
    await upsertTelegramUser({
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
        language_code: ctx.from.language_code
    });
};

const openCheckinWebApp = async (ctx: any) => {
    await ensureUser(ctx);
    if (ctx.chat?.type !== 'private') {
        await ctx.reply('請到 Bot 私人聊天室使用 /checkin 開啟打卡表單。');
        return;
    }
    const keyboard = new InlineKeyboard().webApp('✅ 開始打卡', env.telegramWebappUrl);
    await ctx.reply('請點下方按鈕開啟打卡表單。', { reply_markup: keyboard });
};

bot.command('start', async (ctx) => {
    await ensureUser(ctx);
    if (ctx.chat?.type !== 'private') {
        await ctx.reply('歡迎使用氣功打卡小幫手！請到 Bot 私人聊天室使用 /start 開啟完整功能選單。');
        return;
    }
    const keyboard = new InlineKeyboard()
        .webApp('✅ 開始打卡', env.telegramWebappUrl)
        .webApp('🏆 排行榜', env.telegramLeaderboardWebappUrl)
        .row()
        .webApp('🏮 開啟成就頁', env.telegramAchievementsWebappUrl)
        .webApp('📈 功法分析', env.telegramMethodAnalysisWebappUrl);

    await ctx.reply(
        [
            '歡迎使用氣功打卡小幫手（Telegram 版）！',
            '',
            '你可以直接使用下方四個主要入口：',
            '1. ✅ 打卡',
            '2. 🏆 排行榜',
            '3. 🏮 成就頁',
            '4. 📈 功法分析',
            '',
            '每天練功、每天記錄，穩穩累積你的功力與成就。'
        ].join('\n'),
        { reply_markup: keyboard }
    );
});

bot.command('checkin', async (ctx) => {
    await openCheckinWebApp(ctx);
});

// Forgiving alias for common typo
bot.command('chickin', async (ctx) => {
    await openCheckinWebApp(ctx);
});

bot.command('mystats', async (ctx) => {
    await ensureUser(ctx);
    if (!ctx.from) return;
    const stats = await getUserStats(ctx.from.id);
    await ctx.reply(await buildEnhancedUserStatsMessage(ctx.from.id, stats));
});

bot.command('badges', async (ctx) => {
    await ensureUser(ctx);
    if (!ctx.from) return;
    await ctx.reply(await buildBadgesMessage(ctx.from.id));
});

bot.command('achievements', async (ctx) => {
    await ensureUser(ctx);
    if (ctx.chat?.type !== 'private') {
        await ctx.reply('請到 Bot 私人聊天室使用 /achievements 開啟成就頁。');
        return;
    }
    const keyboard = new InlineKeyboard().webApp('🏮 開啟成就頁', env.telegramAchievementsWebappUrl);
    await ctx.reply('請點下方按鈕開啟你的成就頁。', { reply_markup: keyboard });
});

bot.command('leaderboard', async (ctx) => {
    await ensureUser(ctx);
    const keyboard = new InlineKeyboard().webApp('🏆 開啟排行榜', env.telegramLeaderboardWebappUrl);
    const options = ctx.chat?.type === 'private' ? { reply_markup: keyboard } : undefined;
    await ctx.reply(await buildLeaderboardMessage('all'), options);
});

bot.command('methodanalysis', async (ctx) => {
    await ensureUser(ctx);
    if (ctx.chat?.type !== 'private') {
        await ctx.reply('請到 Bot 私人聊天室使用 /methodanalysis 開啟完整功法分析。');
        return;
    }
    const keyboard = new InlineKeyboard().webApp('📈 開啟功法分析', env.telegramMethodAnalysisWebappUrl);
    await ctx.reply('請點下方按鈕查看你的 30／90 天功法分析與練功點評。', { reply_markup: keyboard });
});

bot.command('weekly', async (ctx) => {
    await ensureUser(ctx);
    await ctx.reply(await buildLeaderboardMessage('week'));
});

bot.command('monthly', async (ctx) => {
    await ensureUser(ctx);
    await ctx.reply(await buildLeaderboardMessage('month'));
});

bot.command('quarterly', async (ctx) => {
    await ensureUser(ctx);
    await ctx.reply(await buildLeaderboardMessage('quarter'));
});

bot.command('yearly', async (ctx) => {
    await ensureUser(ctx);
    await ctx.reply(await buildLeaderboardMessage('year'));
});

bot.command('method30', async (ctx) => {
    await ensureUser(ctx);
    if (!ctx.from) return;
    const result = await getUserMethodMix(ctx.from.id, 30);
    const review = await generateMethodReviewWithLlm(result, buildMethodReview(result), ctx.from.id);
    const keyboard = new InlineKeyboard().webApp('📈 開啟完整功法分析', env.telegramMethodAnalysisWebappUrl);
    const options = ctx.chat?.type === 'private' ? { reply_markup: keyboard } : undefined;
    await ctx.reply(buildMethodMixMessage(result, review), options);
});

bot.command('method90', async (ctx) => {
    await ensureUser(ctx);
    if (!ctx.from) return;
    const result = await getUserMethodMix(ctx.from.id, 90);
    const review = await generateMethodReviewWithLlm(result, buildMethodReview(result), ctx.from.id);
    const keyboard = new InlineKeyboard().webApp('📈 開啟完整功法分析', env.telegramMethodAnalysisWebappUrl);
    const options = ctx.chat?.type === 'private' ? { reply_markup: keyboard } : undefined;
    await ctx.reply(buildMethodMixMessage(result, review), options);
});

bot.on('my_chat_member', async (ctx) => {
    const membership = ctx.myChatMember;
    const chat = membership.chat;
    if (chat.type !== 'group' && chat.type !== 'supergroup') return;
    const member = membership.new_chat_member as unknown as { status: string; is_member?: boolean };
    const oldMember = membership.old_chat_member as unknown as { status: string; is_member?: boolean };
    const isActive = member.status === 'member'
        || member.status === 'administrator'
        || member.status === 'creator'
        || (member.status === 'restricted' && member.is_member === true);
    const wasActive = oldMember.status === 'member'
        || oldMember.status === 'administrator'
        || oldMember.status === 'creator'
        || (oldMember.status === 'restricted' && oldMember.is_member === true);

    if (isActive) {
        await registerTelegramGroup({
            id: chat.id,
            type: chat.type,
            title: chat.title,
            username: 'username' in chat ? chat.username : undefined
        });
        if (!wasActive) {
            await ctx.reply('大家好！我已登記這個群組。每日打卡請私訊 Bot，輸入 /checkin 開始。');
        }
        return;
    }
    await deactivateTelegramGroup(chat.id, `Membership changed to ${member.status}`);
});

bot.on('message:migrate_to_chat_id', async (ctx) => {
    await migrateTelegramGroup(ctx.chat.id, ctx.message.migrate_to_chat_id);
});

bot.command('admin', async (ctx) => {
    const senderId = ctx.from?.id;
    if (!senderId || !env.telegramAdminUserIds.has(String(senderId))) return;
    const input = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    const [rawAction = '', ...rest] = input.split(/\s+/);
    const action = rawAction.toLowerCase().replace(/-/g, '_');

    if (action === 'register_group') {
        if (ctx.chat?.type !== 'group' && ctx.chat?.type !== 'supergroup') {
            await ctx.reply('系統訊息：register_group 必須在目標群組內執行。');
            return;
        }
        await registerTelegramGroup({
            id: ctx.chat.id,
            type: ctx.chat.type,
            title: ctx.chat.title,
            username: 'username' in ctx.chat ? ctx.chat.username : undefined
        });
        await ctx.reply('系統訊息：此群組已成功登記至提醒名單。');
        return;
    }

    if (ctx.chat?.type !== 'private') {
        await ctx.reply('系統訊息：此管理指令只能在 Bot 私人聊天室執行。');
        return;
    }

    if (action === 'create_reminder') {
        await ctx.reply(await createTelegramGroupReminderText());
        return;
    }

    if (action === 'list_groups') {
        const groups = await listTelegramGroups();
        if (groups.length === 0) {
            await ctx.reply('系統訊息：目前沒有已登記的有效群組。');
            return;
        }
        const lines = groups.map((group, index) => `${index + 1}. ${group.title}\n   ${group.chatType} · ${group.chatId}`);
        const chunks: string[] = [];
        let chunk = `系統訊息：目前共有 ${groups.length} 個群組\n\n`;
        for (const line of lines) {
            if ((chunk + line).length > 3500) {
                chunks.push(chunk.trim());
                chunk = '';
            }
            chunk += `${line}\n`;
        }
        if (chunk.trim()) chunks.push(chunk.trim());
        for (const text of chunks) await ctx.reply(text);
        return;
    }

    if (action === 'resend_reminder') {
        if (!env.telegramGroupOpsEnabled) {
            await ctx.reply('系統訊息：TELEGRAM_GROUP_OPS_ENABLED 尚未開啟。');
            return;
        }
        const dispatchId = await enqueueTelegramGroupReminderResend(ctx.update.update_id, senderId);
        await ctx.reply('系統訊息：群組提醒已排入發送佇列，完成後會回報結果。');
        void processTelegramGroupDispatch(dispatchId)
            .then((result) => ctx.api.sendMessage(senderId, result.skipped
                ? '系統訊息：此群組提醒正由另一個程序處理。'
                : `系統訊息：群組提醒處理完成，成功 ${result.success}/${result.total}，永久失敗 ${result.failed}，待重試 ${result.pending}。`))
            .catch((error) => {
                console.error('[telegram-admin] resend reminder failed', error);
                return ctx.api.sendMessage(senderId, '系統訊息：群組提醒補發失敗，請查看 error log。');
            });
        return;
    }

    if (action === 'broadcast') {
        const message = input.slice(rawAction.length).trim();
        if (!message) {
            await ctx.reply('系統訊息：請使用 /admin broadcast <訊息內容>');
            return;
        }
        if (message.length > 4096) {
            await ctx.reply('系統訊息：廣播內容不可超過 4096 字。');
            return;
        }
        if (!env.telegramGroupOpsEnabled) {
            await ctx.reply('系統訊息：TELEGRAM_GROUP_OPS_ENABLED 尚未開啟。');
            return;
        }
        const dispatchId = await enqueueTelegramGroupBroadcast(ctx.update.update_id, message, senderId);
        await ctx.reply('系統訊息：群組廣播已排入發送佇列，完成後會回報結果。');
        void processTelegramGroupDispatch(dispatchId)
            .then((result) => ctx.api.sendMessage(senderId, result.skipped
                ? '系統訊息：此群組廣播正由另一個程序處理。'
                : `系統訊息：群組廣播處理完成，成功 ${result.success}/${result.total}，永久失敗 ${result.failed}，待重試 ${result.pending}。`))
            .catch((error) => {
                console.error('[telegram-admin] broadcast failed', error);
                return ctx.api.sendMessage(senderId, '系統訊息：群組廣播失敗，請查看 error log。');
            });
        return;
    }

    await ctx.reply([
        '系統訊息：可用管理指令',
        '/admin register_group',
        '/admin create_reminder',
        '/admin resend_reminder',
        '/admin list_groups',
        '/admin broadcast <訊息>'
    ].join('\n'));
});

bot.command('remind', async (ctx) => {
    await ensureUser(ctx);
    if (!ctx.from) return;

    const rawInput = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    if (!rawInput) {
        await ctx.reply(buildReminderSettingsMessage(await getTelegramReminderSettings(ctx.from.id)));
        return;
    }

    const [action, ...restParts] = rawInput.split(/\s+/);
    const normalizedAction = action.toLowerCase();

    if (normalizedAction === 'off') {
        const settings = await updateTelegramReminderSettings(ctx.from.id, { reminderEnabled: false });
        await ctx.reply(
            `🔕 已關閉每日打卡提醒。\n目前保留時間 ${formatReminderTime(settings.reminderHour)}（${settings.reminderTimezone}）。\n之後可用 /remind on 重新開啟。`
        );
        return;
    }

    if (normalizedAction === 'on') {
        const settings = await updateTelegramReminderSettings(ctx.from.id, { reminderEnabled: true });
        await ctx.reply(`✅ 已開啟每日打卡提醒：${formatReminderTime(settings.reminderHour)}（${settings.reminderTimezone}）。`);
        return;
    }

    if (normalizedAction === 'tz') {
        const timezone = restParts.join(' ').trim();
        if (!timezone) {
            await ctx.reply('請提供有效時區，例如：/remind tz Asia/Taipei 或 /remind tz America/New_York');
            return;
        }

        if (!moment.tz.zone(timezone)) {
            await ctx.reply('找不到這個時區。請使用 IANA 時區格式，例如：Asia/Taipei、America/New_York。');
            return;
        }

        const settings = await updateTelegramReminderSettings(ctx.from.id, { reminderTimezone: timezone });
        await ctx.reply(`✅ 已將提醒時區設為 ${settings.reminderTimezone}，目前提醒時間為 ${formatReminderTime(settings.reminderHour)}。`);
        return;
    }

    if (!/^\d{1,2}$/.test(normalizedAction)) {
        await ctx.reply('提醒設定格式錯誤。請用 /remind 21、/remind on、/remind off 或 /remind tz Asia/Taipei。');
        return;
    }

    const reminderHour = Number(normalizedAction);
    if (!Number.isInteger(reminderHour) || reminderHour < 0 || reminderHour > 23) {
        await ctx.reply('提醒時間請輸入 0 到 23 的整數，例如：/remind 7 或 /remind 21。');
        return;
    }

    const settings = await updateTelegramReminderSettings(ctx.from.id, {
        reminderEnabled: true,
        reminderHour
    });
    await ctx.reply(`✅ 已將每日提醒設為 ${formatReminderTime(settings.reminderHour)}（${settings.reminderTimezone}），並自動開啟提醒。`);
});

bot.command('remindtest', async (ctx) => {
    await ensureUser(ctx);
    if (!ctx.from) return;
    const result = await sendTelegramReminderPreview(ctx.from.id);
    await ctx.reply(`已送出提醒測試訊息：${result.success}/${result.total}`);
});

bot.on('message:web_app_data', async (ctx) => {
    try {
        const raw = ctx.message?.web_app_data?.data;
        if (!raw) return;

        const payload = JSON.parse(raw);
        if (payload?.type !== 'checkin_summary') return;

        await ctx.reply(buildWebAppCheckinSummary(payload));
    } catch (error) {
        console.error('[telegram-bot] failed to process web_app_data', error);
    }
});

const grammYWebhook = webhookCallback(bot, 'express');

export const telegramWebhook: RequestHandler = async (req, res, next) => {
    try {
        await grammYWebhook(req, res);
    } catch (error) {
        const botError = error as {
            ctx?: {
                update?: { update_id?: number };
                chat?: { type?: string };
                message?: { text?: string };
            };
            error?: unknown;
        };
        const messageText = botError.ctx?.message?.text;
        console.error('[telegram-bot] webhook update failed', {
            updateId: botError.ctx?.update?.update_id,
            chatType: botError.ctx?.chat?.type,
            command: messageText?.startsWith('/') ? messageText.split(/\s+/, 1)[0] : undefined,
            error: serializeError(botError.error ?? error)
        });
        next(error);
    }
};

export const setupBotCommands = async () => {
    try {
        await bot.api.setMyCommands([
            { command: 'start', description: '開始使用 / 顯示主選單' },
            { command: 'checkin', description: '開始今日打卡' },
            { command: 'achievements', description: '查看成就頁' },
            { command: 'mystats', description: '查看我的練功統計' },
            { command: 'badges', description: '查看我的勳章' },
            { command: 'leaderboard', description: '總排行榜' },
            { command: 'weekly', description: '本週排行榜' },
            { command: 'monthly', description: '本月排行榜' },
            { command: 'methodanalysis', description: '開啟完整功法分析' },
            { command: 'method30', description: '最近 30 天功法分析' },
            { command: 'method90', description: '最近 90 天功法分析' },
            { command: 'remind', description: '設定每日提醒時間 / 時區 / 開關' },
            { command: 'remindtest', description: '送出一則提醒測試訊息' }
        ]);
        console.log('[telegram-bot] command menu registered');
    } catch (error) {
        console.error('[telegram-bot] failed to register command menu', error);
    }
};
