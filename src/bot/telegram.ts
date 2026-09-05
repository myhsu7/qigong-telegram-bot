import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { upsertTelegramUser } from '../services/checkin';
import { buildBadgesMessage, buildEnhancedUserStatsMessage, buildLeaderboardMessage, getUserStats } from '../services/stats';
import { buildMethodMixMessage, buildMethodReview, getUserMethodMix } from '../services/methodAnalysis';
import { generateMethodReviewWithLlm } from '../services/methodReviewLlm';
import { getTelegramReminderSettings, sendTelegramReminderPreview, updateTelegramReminderSettings } from '../services/reminders';
import { buildWebAppCheckinSummary } from '../services/chatSummary';
import { Locale, botText, normalizeLocale } from '../i18n';
import { getTelegramUserLocale, setTelegramUserLocale } from '../services/language';
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

const privateText = {
    zh_TW: {
        reminderTitle: '🔔 你的打卡提醒設定', enabled: '已開啟', disabled: '已關閉', status: '狀態', time: '時間', timezone: '時區', commands: '可用指令：',
        reminderCommands: ['- `/remind`：查看目前設定', '- `/remind 21`：設為 21:00', '- `/remind on`：開啟提醒', '- `/remind off`：關閉提醒', '- `/remind tz Asia/Taipei`：設定時區'],
        reminderOff: (time: string, timezone: string) => `🔕 已關閉每日打卡提醒。\n目前保留時間 ${time}（${timezone}）。\n之後可用 /remind on 重新開啟。`,
        reminderOn: (time: string, timezone: string) => `✅ 已開啟每日打卡提醒：${time}（${timezone}）。`,
        timezoneRequired: '請提供有效時區，例如：/remind tz Asia/Taipei 或 /remind tz America/New_York',
        timezoneInvalid: '找不到這個時區。請使用 IANA 時區格式，例如：Asia/Taipei、America/New_York。',
        timezoneSaved: (timezone: string, time: string) => `✅ 已將提醒時區設為 ${timezone}，目前提醒時間為 ${time}。`,
        reminderFormat: '提醒設定格式錯誤。請用 /remind 21、/remind on、/remind off 或 /remind tz Asia/Taipei。',
        reminderHourInvalid: '提醒時間請輸入 0 到 23 的整數，例如：/remind 7 或 /remind 21。',
        reminderSaved: (time: string, timezone: string) => `✅ 已將每日提醒設為 ${time}（${timezone}），並自動開啟提醒。`,
        reminderTest: (success: number, total: number) => `已送出提醒測試訊息：${success}/${total}`,
        fullAnalysisButton: '📈 開啟完整功法分析'
    },
    zh_CN: {
        reminderTitle: '🔔 你的打卡提醒设置', enabled: '已开启', disabled: '已关闭', status: '状态', time: '时间', timezone: '时区', commands: '可用命令：',
        reminderCommands: ['- `/remind`：查看当前设置', '- `/remind 21`：设置为 21:00', '- `/remind on`：开启提醒', '- `/remind off`：关闭提醒', '- `/remind tz Asia/Shanghai`：设置时区'],
        reminderOff: (time: string, timezone: string) => `🔕 已关闭每日打卡提醒。\n当前保留时间 ${time}（${timezone}）。\n之后可用 /remind on 重新开启。`,
        reminderOn: (time: string, timezone: string) => `✅ 已开启每日打卡提醒：${time}（${timezone}）。`,
        timezoneRequired: '请提供有效时区，例如：/remind tz Asia/Shanghai 或 /remind tz America/New_York',
        timezoneInvalid: '找不到这个时区。请使用 IANA 时区格式，例如：Asia/Shanghai、America/New_York。',
        timezoneSaved: (timezone: string, time: string) => `✅ 已将提醒时区设置为 ${timezone}，当前提醒时间为 ${time}。`,
        reminderFormat: '提醒设置格式错误。请用 /remind 21、/remind on、/remind off 或 /remind tz Asia/Shanghai。',
        reminderHourInvalid: '提醒时间请输入 0 到 23 的整数，例如：/remind 7 或 /remind 21。',
        reminderSaved: (time: string, timezone: string) => `✅ 已将每日提醒设置为 ${time}（${timezone}），并自动开启提醒。`,
        reminderTest: (success: number, total: number) => `已发送提醒测试消息：${success}/${total}`,
        fullAnalysisButton: '📈 打开完整功法分析'
    },
    en: {
        reminderTitle: '🔔 Your check-in reminder settings', enabled: 'On', disabled: 'Off', status: 'Status', time: 'Time', timezone: 'Time zone', commands: 'Available commands:',
        reminderCommands: ['- `/remind`: View current settings', '- `/remind 21`: Set the time to 21:00', '- `/remind on`: Turn reminders on', '- `/remind off`: Turn reminders off', '- `/remind tz America/New_York`: Set the time zone'],
        reminderOff: (time: string, timezone: string) => `🔕 Daily check-in reminders are off.\nThe saved time is ${time} (${timezone}).\nUse /remind on to turn them back on.`,
        reminderOn: (time: string, timezone: string) => `✅ Daily check-in reminders are on at ${time} (${timezone}).`,
        timezoneRequired: 'Provide a valid time zone, for example: /remind tz America/New_York or /remind tz Asia/Taipei',
        timezoneInvalid: 'Time zone not found. Use an IANA time zone such as America/New_York or Asia/Taipei.',
        timezoneSaved: (timezone: string, time: string) => `✅ Reminder time zone set to ${timezone}. The current reminder time is ${time}.`,
        reminderFormat: 'Invalid reminder setting. Use /remind 21, /remind on, /remind off, or /remind tz America/New_York.',
        reminderHourInvalid: 'Enter an integer from 0 to 23, for example: /remind 7 or /remind 21.',
        reminderSaved: (time: string, timezone: string) => `✅ Daily reminder set to ${time} (${timezone}) and turned on.`,
        reminderTest: (success: number, total: number) => `Reminder test sent: ${success}/${total}`,
        fullAnalysisButton: '📈 Open full practice analysis'
    }
} satisfies Record<Locale, object>;

const buildReminderSettingsMessage = (settings: {
    reminderEnabled: boolean;
    reminderHour: number;
    reminderTimezone: string;
}, locale: Locale) => {
    const text = privateText[locale];
    const separator = locale === 'en' ? ': ' : '：';
    return [
        text.reminderTitle,
        '',
        `${text.status}${separator}${settings.reminderEnabled ? text.enabled : text.disabled}`,
        `${text.time}${separator}${formatReminderTime(settings.reminderHour)}`,
        `${text.timezone}${separator}${settings.reminderTimezone}`,
        '',
        text.commands,
        ...text.reminderCommands
    ].join('\n');
};

const ensureUser = async (ctx: any): Promise<Locale> => {
    const fallbackLocale = normalizeLocale(ctx.from?.language_code);
    if (!ctx.from) return fallbackLocale;
    return upsertTelegramUser({
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
        language_code: ctx.from.language_code
    });
};

const privateUserLocale = (ctx: any, locale: Locale): Locale => ctx.chat?.type === 'private' ? locale : 'zh_TW';

const openCheckinWebApp = async (ctx: any) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    if (ctx.chat?.type !== 'private') {
        await ctx.reply('請到 Bot 私人聊天室使用 /checkin 開啟打卡表單。');
        return;
    }
    const keyboard = new InlineKeyboard().webApp(botText[locale].checkinButton, env.telegramWebappUrl);
    await ctx.reply(botText[locale].openCheckin, { reply_markup: keyboard });
};

bot.command('start', async (ctx) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    if (ctx.chat?.type !== 'private') {
        await ctx.reply('歡迎使用氣功打卡小幫手！請到 Bot 私人聊天室使用 /start 開啟完整功能選單。');
        return;
    }
    void syncPrivateCommandMenu(ctx.chat.id, locale).catch((error) => console.error('[telegram-bot] failed to sync private command menu', error));
    const keyboard = new InlineKeyboard()
        .webApp(botText[locale].checkinButton, env.telegramWebappUrl)
        .webApp(botText[locale].leaderboardButton, env.telegramLeaderboardWebappUrl)
        .row()
        .webApp(botText[locale].achievementsButton, env.telegramAchievementsWebappUrl)
        .webApp(botText[locale].analysisButton, env.telegramMethodAnalysisWebappUrl);

    await ctx.reply(botText[locale].welcome, { reply_markup: keyboard });
});

bot.command('checkin', async (ctx) => {
    await openCheckinWebApp(ctx);
});

// Forgiving alias for common typo
bot.command('chickin', async (ctx) => {
    await openCheckinWebApp(ctx);
});

bot.command('mystats', async (ctx) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    if (!ctx.from) return;
    const stats = await getUserStats(ctx.from.id);
    await ctx.reply(await buildEnhancedUserStatsMessage(ctx.from.id, stats, locale));
});

bot.command('badges', async (ctx) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    if (!ctx.from) return;
    await ctx.reply(await buildBadgesMessage(ctx.from.id, locale));
});

bot.command('achievements', async (ctx) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    if (ctx.chat?.type !== 'private') {
        await ctx.reply('請到 Bot 私人聊天室使用 /achievements 開啟成就頁。');
        return;
    }
    const keyboard = new InlineKeyboard().webApp(botText[locale].achievementsButton, env.telegramAchievementsWebappUrl);
    await ctx.reply(botText[locale].openAchievements, { reply_markup: keyboard });
});

bot.command('leaderboard', async (ctx) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    const keyboard = new InlineKeyboard().webApp(botText[locale].leaderboardButton, env.telegramLeaderboardWebappUrl);
    const options = ctx.chat?.type === 'private' ? { reply_markup: keyboard } : undefined;
    await ctx.reply(await buildLeaderboardMessage('all', locale), options);
});

bot.command('methodanalysis', async (ctx) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    if (ctx.chat?.type !== 'private') {
        await ctx.reply('請到 Bot 私人聊天室使用 /methodanalysis 開啟完整功法分析。');
        return;
    }
    const keyboard = new InlineKeyboard().webApp(privateText[locale].fullAnalysisButton, env.telegramMethodAnalysisWebappUrl);
    await ctx.reply(botText[locale].openAnalysis, { reply_markup: keyboard });
});

bot.command('weekly', async (ctx) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    await ctx.reply(await buildLeaderboardMessage('week', locale));
});

bot.command('monthly', async (ctx) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    await ctx.reply(await buildLeaderboardMessage('month', locale));
});

bot.command('quarterly', async (ctx) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    await ctx.reply(await buildLeaderboardMessage('quarter', locale));
});

bot.command('yearly', async (ctx) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    await ctx.reply(await buildLeaderboardMessage('year', locale));
});

bot.command('method30', async (ctx) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    if (!ctx.from) return;
    const result = await getUserMethodMix(ctx.from.id, 30, locale);
    const review = await generateMethodReviewWithLlm(result, buildMethodReview(result, locale), ctx.from.id, locale);
    const keyboard = new InlineKeyboard().webApp(privateText[locale].fullAnalysisButton, env.telegramMethodAnalysisWebappUrl);
    const options = ctx.chat?.type === 'private' ? { reply_markup: keyboard } : undefined;
    await ctx.reply(buildMethodMixMessage(result, review, locale), options);
});

bot.command('method90', async (ctx) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    if (!ctx.from) return;
    const result = await getUserMethodMix(ctx.from.id, 90, locale);
    const review = await generateMethodReviewWithLlm(result, buildMethodReview(result, locale), ctx.from.id, locale);
    const keyboard = new InlineKeyboard().webApp(privateText[locale].fullAnalysisButton, env.telegramMethodAnalysisWebappUrl);
    const options = ctx.chat?.type === 'private' ? { reply_markup: keyboard } : undefined;
    await ctx.reply(buildMethodMixMessage(result, review, locale), options);
});

bot.command('language', async (ctx) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    if (ctx.chat?.type !== 'private') {
        await ctx.reply('請到 Bot 私人聊天室使用 /language 設定介面語言。');
        return;
    }
    const keyboard = new InlineKeyboard()
        .text('繁體中文', 'language:zh_TW')
        .text('简体中文', 'language:zh_CN')
        .text('English', 'language:en');
    await ctx.reply(botText[locale].languagePrompt, { reply_markup: keyboard });
});

bot.callbackQuery(/^language:(zh_TW|zh_CN|en)$/, async (ctx) => {
    if (!ctx.from) return;
    const locale = ctx.match[1] as Locale;
    await ensureUser(ctx);
    await setTelegramUserLocale(ctx.from.id, locale);
    if (ctx.chat?.type === 'private') {
        await syncPrivateCommandMenu(ctx.chat.id, locale);
    }
    await ctx.answerCallbackQuery();
    await ctx.reply(botText[locale].languageSaved);
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
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    if (!ctx.from) return;
    const text = privateText[locale];

    const rawInput = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    if (!rawInput) {
        await ctx.reply(buildReminderSettingsMessage(await getTelegramReminderSettings(ctx.from.id), locale));
        return;
    }

    const [action, ...restParts] = rawInput.split(/\s+/);
    const normalizedAction = action.toLowerCase();

    if (normalizedAction === 'off') {
        const settings = await updateTelegramReminderSettings(ctx.from.id, { reminderEnabled: false });
        await ctx.reply(text.reminderOff(formatReminderTime(settings.reminderHour), settings.reminderTimezone));
        return;
    }

    if (normalizedAction === 'on') {
        const settings = await updateTelegramReminderSettings(ctx.from.id, { reminderEnabled: true });
        await ctx.reply(text.reminderOn(formatReminderTime(settings.reminderHour), settings.reminderTimezone));
        return;
    }

    if (normalizedAction === 'tz') {
        const timezone = restParts.join(' ').trim();
        if (!timezone) {
            await ctx.reply(text.timezoneRequired);
            return;
        }

        if (!moment.tz.zone(timezone)) {
            await ctx.reply(text.timezoneInvalid);
            return;
        }

        const settings = await updateTelegramReminderSettings(ctx.from.id, { reminderTimezone: timezone });
        await ctx.reply(text.timezoneSaved(settings.reminderTimezone, formatReminderTime(settings.reminderHour)));
        return;
    }

    if (!/^\d{1,2}$/.test(normalizedAction)) {
        await ctx.reply(text.reminderFormat);
        return;
    }

    const reminderHour = Number(normalizedAction);
    if (!Number.isInteger(reminderHour) || reminderHour < 0 || reminderHour > 23) {
        await ctx.reply(text.reminderHourInvalid);
        return;
    }

    const settings = await updateTelegramReminderSettings(ctx.from.id, {
        reminderEnabled: true,
        reminderHour
    });
    await ctx.reply(text.reminderSaved(formatReminderTime(settings.reminderHour), settings.reminderTimezone));
});

bot.command('remindtest', async (ctx) => {
    const locale = privateUserLocale(ctx, await ensureUser(ctx));
    if (!ctx.from) return;
    const result = await sendTelegramReminderPreview(ctx.from.id);
    await ctx.reply(privateText[locale].reminderTest(result.success, result.total));
});

bot.on('message:web_app_data', async (ctx) => {
    try {
        const raw = ctx.message?.web_app_data?.data;
        if (!raw) return;

        const payload = JSON.parse(raw);
        if (payload?.type !== 'checkin_summary') return;

        const locale = await getTelegramUserLocale(ctx.from.id);
        await ctx.reply(buildWebAppCheckinSummary(payload, locale));
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

const commandMenus: Record<Locale, Array<{ command: string; description: string }>> = {
    zh_TW: [
        { command: 'start', description: '開始使用 / 顯示主選單' },
        { command: 'checkin', description: '開始今日打卡' },
        { command: 'achievements', description: '查看成就頁' },
        { command: 'mystats', description: '查看我的練功統計' },
        { command: 'badges', description: '查看我的勳章' },
        { command: 'leaderboard', description: '總排行榜' },
        { command: 'weekly', description: '本週排行榜' },
        { command: 'monthly', description: '本月排行榜' },
        { command: 'quarterly', description: '本季排行榜' },
        { command: 'yearly', description: '本年排行榜' },
        { command: 'methodanalysis', description: '開啟完整功法分析' },
        { command: 'method30', description: '最近 30 天功法分析' },
        { command: 'method90', description: '最近 90 天功法分析' },
        { command: 'remind', description: '設定每日提醒時間 / 時區 / 開關' },
        { command: 'remindtest', description: '送出一則提醒測試訊息' },
        { command: 'language', description: '設定介面語言' }
    ],
    zh_CN: [
        { command: 'start', description: '开始使用 / 显示主菜单' },
        { command: 'checkin', description: '开始今日打卡' },
        { command: 'achievements', description: '查看成就页' },
        { command: 'mystats', description: '查看我的练功统计' },
        { command: 'badges', description: '查看我的勋章' },
        { command: 'leaderboard', description: '总排行榜' },
        { command: 'weekly', description: '本周排行榜' },
        { command: 'monthly', description: '本月排行榜' },
        { command: 'quarterly', description: '本季度排行榜' },
        { command: 'yearly', description: '本年排行榜' },
        { command: 'methodanalysis', description: '打开完整功法分析' },
        { command: 'method30', description: '最近 30 天功法分析' },
        { command: 'method90', description: '最近 90 天功法分析' },
        { command: 'remind', description: '设置每日提醒时间 / 时区 / 开关' },
        { command: 'remindtest', description: '发送一条提醒测试消息' },
        { command: 'language', description: '设置界面语言' }
    ],
    en: [
        { command: 'start', description: 'Get started / show the main menu' },
        { command: 'checkin', description: "Start today's check-in" },
        { command: 'achievements', description: 'View achievements' },
        { command: 'mystats', description: 'View my practice stats' },
        { command: 'badges', description: 'View my badges' },
        { command: 'leaderboard', description: 'All-time leaderboard' },
        { command: 'weekly', description: 'Weekly leaderboard' },
        { command: 'monthly', description: 'Monthly leaderboard' },
        { command: 'quarterly', description: 'Quarterly leaderboard' },
        { command: 'yearly', description: 'Yearly leaderboard' },
        { command: 'methodanalysis', description: 'Open full practice analysis' },
        { command: 'method30', description: '30-day practice analysis' },
        { command: 'method90', description: '90-day practice analysis' },
        { command: 'remind', description: 'Set reminder time, time zone, or status' },
        { command: 'remindtest', description: 'Send a reminder test message' },
        { command: 'language', description: 'Set interface language' }
    ]
};

export const syncPrivateCommandMenu = (chatId: number, locale: Locale) =>
    bot.api.setMyCommands(commandMenus[locale], { scope: { type: 'chat', chat_id: chatId } });

export const setupBotCommands = async () => {
    try {
        await Promise.all([
            bot.api.setMyCommands(commandMenus.zh_TW),
            bot.api.setMyCommands(commandMenus.en, { scope: { type: 'default' }, language_code: 'en' })
        ]);
        console.log('[telegram-bot] command menu registered');
    } catch (error) {
        console.error('[telegram-bot] failed to register command menu', error);
    }
};
