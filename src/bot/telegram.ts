import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import { env } from '../config/env';
import { upsertTelegramUser } from '../services/checkin';
import { buildBadgesMessage, buildEnhancedUserStatsMessage, buildLeaderboardMessage, getUserStats } from '../services/stats';
import { buildMethodMixMessage, getUserMethodMix } from '../services/methodAnalysis';
import { getTelegramReminderSettings, sendTelegramReminderPreview, updateTelegramReminderSettings } from '../services/reminders';
import { buildWebAppCheckinSummary } from '../services/chatSummary';
import moment from 'moment-timezone';

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
    const keyboard = new InlineKeyboard().webApp('✅ 開始打卡', env.telegramWebappUrl);
    await ctx.reply('請點下方按鈕開啟打卡表單。', { reply_markup: keyboard });
};

bot.command('start', async (ctx) => {
    await ensureUser(ctx);
    const keyboard = new InlineKeyboard()
        .webApp('✅ 開始打卡', env.telegramWebappUrl)
        .row()
        .webApp('🏮 開啟成就頁', env.telegramAchievementsWebappUrl);

    await ctx.reply(
        [
            '歡迎使用氣功打卡小幫手（Telegram 版）！',
            '',
            '你可以直接使用下方兩個主要入口：',
            '1. ✅ 打卡',
            '2. 🏮 成就頁',
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
    const keyboard = new InlineKeyboard().webApp('🏮 開啟成就頁', env.telegramAchievementsWebappUrl);
    await ctx.reply('請點下方按鈕開啟你的成就頁。', { reply_markup: keyboard });
});

bot.command('leaderboard', async (ctx) => {
    await ensureUser(ctx);
    await ctx.reply(await buildLeaderboardMessage('all'));
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
    await ctx.reply(buildMethodMixMessage(result));
});

bot.command('method90', async (ctx) => {
    await ensureUser(ctx);
    if (!ctx.from) return;
    const result = await getUserMethodMix(ctx.from.id, 90);
    await ctx.reply(buildMethodMixMessage(result));
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

export const telegramWebhook = webhookCallback(bot, 'express');

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
