import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import { env } from '../config/env';
import { upsertTelegramUser } from '../services/checkin';
import { buildBadgesMessage, buildEnhancedUserStatsMessage, buildLeaderboardMessage, getUserStats } from '../services/stats';
import { buildMethodMixMessage, getUserMethodMix } from '../services/methodAnalysis';
import { sendDailyTelegramReminder } from '../services/reminders';

export const bot = new Bot(env.telegramBotToken);

const buildWebAppCheckinSummary = (payload: any) => {
    const methods = Array.isArray(payload?.selectedMethods) ? payload.selectedMethods.filter((item: unknown) => typeof item === 'string' && item.trim()) : [];
    const summaryLines = [
        '✅ 打卡成功',
        '',
        `今日功法：${methods.join('、')}`
    ];

    if (payload?.stats) {
        summaryLines.push(`🔥 連續打卡：${payload.stats.currentStreak || 0} 天`);
        summaryLines.push(`⭐ 總打卡天數：${payload.stats.totalCheckins || 0} 天`);
    }

    if (Array.isArray(payload?.unlockedBadges) && payload.unlockedBadges.length > 0) {
        summaryLines.push('');
        summaryLines.push('🎉 新解鎖成就：');
        payload.unlockedBadges.forEach((badge: any) => {
            const yearText = badge?.earnedYear && badge.earnedYear !== 0 ? ` (${badge.earnedYear}年)` : '';
            summaryLines.push(`${badge?.emoji || '🏅'} ${badge?.name || '新勳章'}${yearText}`);
        });
    }

    return summaryLines.join('\n');
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

bot.command('remindtest', async (ctx) => {
    await ensureUser(ctx);
    const result = await sendDailyTelegramReminder();
    await ctx.reply(`補發提醒完成：${result.success}/${result.total}`);
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
