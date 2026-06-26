import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import { env } from '../config/env';

export const bot = new Bot(env.telegramBotToken);

bot.command('start', async (ctx) => {
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
    const keyboard = new InlineKeyboard().webApp('✅ 開始打卡', env.telegramWebappUrl);
    await ctx.reply('請點下方按鈕開啟打卡表單。', { reply_markup: keyboard });
});

bot.command('mystats', async (ctx) => {
    await ctx.reply('`/mystats` 功能尚在建置中，之後會顯示你的連續天數、總打卡天數與功法分析。');
});

bot.command('leaderboard', async (ctx) => {
    await ctx.reply('`/leaderboard` 功能尚在建置中，之後會顯示週 / 月 / 季排行榜。');
});

export const telegramWebhook = webhookCallback(bot, 'express');
