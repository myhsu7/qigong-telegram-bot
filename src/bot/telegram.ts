import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import { env } from '../config/env';
import { upsertTelegramUser } from '../services/checkin';
import { buildBadgesMessage, buildEnhancedUserStatsMessage, buildLeaderboardMessage, getUserStats } from '../services/stats';
import { buildMethodMixMessage, getUserMethodMix } from '../services/methodAnalysis';
import { sendDailyTelegramReminder } from '../services/reminders';

export const bot = new Bot(env.telegramBotToken);

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

bot.command('start', async (ctx) => {
    await ensureUser(ctx);
    const keyboard = new InlineKeyboard().webApp('✅ 開始打卡', env.telegramWebappUrl);

    await ctx.reply(
        [
            '歡迎使用氣功打卡小幫手（Telegram 版）！',
            '',
            '目前 MVP 版已可使用 Web App 打卡入口。',
            '你可以直接點下方按鈕開始今日打卡。'
        ].join('\n'),
        { reply_markup: keyboard }
    );
});

bot.command('checkin', async (ctx) => {
    await ensureUser(ctx);
    const keyboard = new InlineKeyboard().webApp('✅ 開始打卡', env.telegramWebappUrl);
    await ctx.reply('請點下方按鈕開啟打卡表單。', { reply_markup: keyboard });
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

export const telegramWebhook = webhookCallback(bot, 'express');
