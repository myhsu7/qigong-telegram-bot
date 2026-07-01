import { Bot } from 'grammy';
import { env } from '../config/env';

const summaryBot = new Bot(env.telegramBotToken);

export const buildWebAppCheckinSummary = (payload: any) => {
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

export const sendTelegramCheckinSummary = async (chatId: number, payload: any) => {
    await summaryBot.api.sendMessage(chatId, buildWebAppCheckinSummary(payload));
};
