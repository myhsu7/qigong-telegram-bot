import { Bot } from 'grammy';
import { env } from '../config/env';
import { Locale } from '../i18n';

const summaryBot = new Bot(env.telegramBotToken);

export const buildWebAppCheckinSummary = (payload: any, locale: Locale = 'zh_TW') => {
    const methods = Array.isArray(payload?.selectedMethods) ? payload.selectedMethods.filter((item: unknown) => typeof item === 'string' && item.trim()) : [];
    const labels = locale === 'en'
        ? { success: '✅ Check-in complete', methods: 'Today’s methods', streak: 'Current streak', total: 'Total check-ins', unlocked: '🎉 Newly unlocked:', badge: 'New badge', day: 'days', year: '' }
        : locale === 'zh_CN'
            ? { success: '✅ 打卡成功', methods: '今日功法', streak: '连续打卡', total: '总打卡天数', unlocked: '🎉 新解锁成就：', badge: '新勋章', day: '天', year: '年' }
            : { success: '✅ 打卡成功', methods: '今日功法', streak: '連續打卡', total: '總打卡天數', unlocked: '🎉 新解鎖成就：', badge: '新勳章', day: '天', year: '年' };
    const separator = locale === 'en' ? ', ' : '、';
    const summaryLines = [
        labels.success,
        '',
        `${labels.methods}: ${methods.join(separator)}`
    ];

    if (payload?.stats) {
        summaryLines.push(`🔥 ${labels.streak}: ${payload.stats.currentStreak || 0} ${labels.day}`);
        summaryLines.push(`⭐ ${labels.total}: ${payload.stats.totalCheckins || 0} ${labels.day}`);
    }

    if (Array.isArray(payload?.unlockedBadges) && payload.unlockedBadges.length > 0) {
        summaryLines.push('');
        summaryLines.push(labels.unlocked);
        payload.unlockedBadges.forEach((badge: any) => {
            const yearText = badge?.earnedYear && badge.earnedYear !== 0 ? ` (${badge.earnedYear}${labels.year})` : '';
            summaryLines.push(`${badge?.emoji || '🏅'} ${badge?.name || labels.badge}${yearText}`);
        });
    }

    return summaryLines.join('\n');
};

export const sendTelegramCheckinSummary = async (chatId: number, payload: any, locale: Locale = 'zh_TW') => {
    await summaryBot.api.sendMessage(chatId, buildWebAppCheckinSummary(payload, locale));
};
