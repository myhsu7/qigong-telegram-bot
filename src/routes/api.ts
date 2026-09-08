import { Request, Router } from 'express';
import { verifyTelegramWebAppInitData } from '../utils/telegramWebApp';
import { getPracticeMethods, getTodayCheckin, mergeLegacyPracticeNotes, saveTodayCheckin, upsertTelegramUser } from '../services/checkin';
import { getLeaderboard, getLevelTitle, getUserStats, LeaderboardPeriod } from '../services/stats';
import { evaluateTelegramBadges } from '../services/badges';
import { getUserBadges } from '../services/badges';
import { sendTelegramCheckinSummary } from '../services/chatSummary';
import { getTelegramHistory } from '../services/history';
import { buildMethodReview, getUserMethodMix, getUserPracticeJournal } from '../services/methodAnalysis';
import { generateMethodReviewWithLlm } from '../services/methodReviewLlm';
import { isLocale, Locale } from '../i18n';
import { setTelegramUserLocale } from '../services/language';
import { TelegramWebAppUser } from '../utils/telegramWebApp';
import { syncPrivateCommandMenu } from '../bot/telegram';
import { getPracticeFeelingTags } from '../services/practiceFeelingTags';

const router = Router();

const resolveInitData = (req: Request) => {
    return req.header('x-telegram-init-data') || req.body?.initData || '';
};

const resolveUserLocale = async (req: Request, user: TelegramWebAppUser): Promise<Locale> => {
    const storedLocale = await upsertTelegramUser(user);
    const requestedLocale = typeof req.query.locale === 'string' && isLocale(req.query.locale) ? req.query.locale : null;
    return requestedLocale || storedLocale;
};

router.get('/profile', async (req, res) => {
    try {
        const auth = verifyTelegramWebAppInitData(resolveInitData(req));
        res.json({ locale: await upsertTelegramUser(auth.user) });
    } catch (error) {
        res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
    }
});

router.patch('/profile/language', async (req, res) => {
    try {
        const auth = verifyTelegramWebAppInitData(resolveInitData(req));
        await upsertTelegramUser(auth.user);
        if (!isLocale(req.body?.locale)) return res.status(400).json({ error: 'Unsupported locale' });
        await setTelegramUserLocale(auth.user.id, req.body.locale);
        await syncPrivateCommandMenu(auth.user.id, req.body.locale);
        res.json({ locale: req.body.locale });
    } catch (error) {
        res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
    }
});

router.get('/practice-methods', async (req, res) => {
    const startedAt = Date.now();
    try {
        const methods = await getPracticeMethods();
        console.log(`[api] loaded practice methods in ${Date.now() - startedAt}ms (${methods.length} roots)`);
        res.json({ methods });
    } catch (error) {
        console.error(`[api] failed to load practice methods after ${Date.now() - startedAt}ms`, error);
        res.status(500).json({ error: 'Failed to load practice methods' });
    }
});

router.get('/practice-feeling-tags', async (req, res) => {
    try {
        verifyTelegramWebAppInitData(resolveInitData(req));
    } catch (error) {
        return res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
    }
    try {
        res.json({ tags: await getPracticeFeelingTags() });
    } catch (error) {
        console.error('[api] failed to load practice feeling tags', error);
        res.status(500).json({ error: 'Failed to load practice feeling tags' });
    }
});

router.get('/checkin/today', async (req, res) => {
    const startedAt = Date.now();
    try {
        const initData = resolveInitData(req);
        const auth = verifyTelegramWebAppInitData(initData);
        const locale = await resolveUserLocale(req, auth.user);
        const data = await getTodayCheckin(auth.user.id, locale);
        console.log(`[api] loaded today checkin in ${Date.now() - startedAt}ms for ${auth.user.id}`);
        res.json(data);
    } catch (error) {
        console.error(`[api] failed to load today checkin after ${Date.now() - startedAt}ms`, error);
        res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
    }
});

router.post('/checkin', async (req, res) => {
    try {
        const initData = resolveInitData(req);
        const auth = verifyTelegramWebAppInitData(initData);
        const locale = await resolveUserLocale(req, auth.user);

        const methodIds: number[] = Array.isArray(req.body?.methodIds)
            ? Array.from(new Set(
                req.body.methodIds
                    .map((id: unknown) => Number(id))
                    .filter((id: number) => Number.isFinite(id) && id > 0)
            ))
            : [];
        const practiceNote = typeof req.body?.practiceNote === 'string'
            ? req.body.practiceNote
            : mergeLegacyPracticeNotes(
                typeof req.body?.reflectionNote === 'string' ? req.body.reflectionNote : '',
                typeof req.body?.bodyFeelingNote === 'string' ? req.body.bodyFeelingNote : '',
                locale
            );

        const saved = await saveTodayCheckin(auth.user.id, methodIds, practiceNote, locale);
        const unlockedBadges = await evaluateTelegramBadges(auth.user.id, saved.selectedMethodCodes, locale);
        const stats = await getUserStats(auth.user.id);
        try {
            await sendTelegramCheckinSummary(auth.user.id, {
                selectedMethods: saved.selectedMethods,
                stats,
                unlockedBadges
            }, locale);
        } catch (summaryError) {
            console.error('[api] failed to send check-in summary to Telegram chat', summaryError);
        }
        res.json({ ok: true, ...saved, stats, unlockedBadges });
    } catch (error) {
        console.error('[api] failed to save today checkin', error);
        res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to save check-in' });
    }
});

router.get('/history', async (req, res) => {
    try {
        const initData = resolveInitData(req);
        const auth = verifyTelegramWebAppInitData(initData);
        const locale = await resolveUserLocale(req, auth.user);

        const monthParam = typeof req.query.month === 'string' ? req.query.month : undefined;
        const data = await getTelegramHistory(auth.user.id, monthParam, locale);
        res.json(data);
    } catch (error) {
        console.error('[api] failed to load history', error);
        res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
    }
});

router.get('/achievements', async (req, res) => {
    try {
        const initData = resolveInitData(req);
        const auth = verifyTelegramWebAppInitData(initData);
        const locale = await resolveUserLocale(req, auth.user);

        const stats = await getUserStats(auth.user.id);
        const badges = await getUserBadges(auth.user.id, locale);
        const levelTitle = getLevelTitle(stats.totalCheckins, locale);

        let nextMilestone = null;
        if (stats.totalCheckins < 30) {
            nextMilestone = { type: 'level', title: getLevelTitle(30, locale), remaining: 30 - stats.totalCheckins, unit: locale === 'en' ? 'total check-in days' : locale === 'zh_CN' ? '天总打卡' : '天總打卡' };
        } else if (stats.totalCheckins < 90) {
            nextMilestone = { type: 'level', title: getLevelTitle(90, locale), remaining: 90 - stats.totalCheckins, unit: locale === 'en' ? 'total check-in days' : locale === 'zh_CN' ? '天总打卡' : '天總打卡' };
        } else if (stats.totalCheckins < 200) {
            nextMilestone = { type: 'level', title: getLevelTitle(200, locale), remaining: 200 - stats.totalCheckins, unit: locale === 'en' ? 'total check-in days' : locale === 'zh_CN' ? '天总打卡' : '天總打卡' };
        }

        res.json({ stats, badges, levelTitle, nextMilestone });
    } catch (error) {
        console.error('[api] failed to load achievements', error);
        res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
    }
});

router.get('/leaderboard', async (req, res) => {
    let auth: ReturnType<typeof verifyTelegramWebAppInitData>;
    try {
        auth = verifyTelegramWebAppInitData(resolveInitData(req));
    } catch (error) {
        return res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
    }
    try {
        await resolveUserLocale(req, auth.user);
        const period = typeof req.query.period === 'string' ? req.query.period : 'week';
        if (!['week', 'month', 'quarter', 'year', 'all'].includes(period)) {
            return res.status(400).json({ error: 'Invalid period' });
        }
        const data = await getLeaderboard(period as LeaderboardPeriod);
        const currentUserId = Number(auth.user.id);
        res.json({
            period,
            totals: data.totals.map((row, index) => ({
                rank: index + 1,
                displayName: row.displayName,
                totalDays: row.totalDays,
                isCurrentUser: row.telegramUserId === currentUserId
            })),
            streaks: data.streaks.map((row, index) => ({
                rank: index + 1,
                displayName: row.displayName,
                maxStreak: row.maxStreak,
                isCurrentUser: row.telegramUserId === currentUserId
            }))
        });
    } catch (error) {
        console.error('[api] failed to load leaderboard', error);
        res.status(500).json({ error: 'Failed to load leaderboard' });
    }
});

router.get('/method-analysis', async (req, res) => {
    let auth: ReturnType<typeof verifyTelegramWebAppInitData>;
    try {
        auth = verifyTelegramWebAppInitData(resolveInitData(req));
    } catch (error) {
        return res.status(401).json({ error: error instanceof Error ? error.message : 'Unauthorized' });
    }
    try {
        const locale = await resolveUserLocale(req, auth.user);
        const [analysis30, analysis90, journal] = await Promise.all([
            getUserMethodMix(auth.user.id, 30, locale),
            getUserMethodMix(auth.user.id, 90, locale),
            getUserPracticeJournal(auth.user.id, 12, locale)
        ]);
        const [reviewText30, reviewText90] = await Promise.all([
            generateMethodReviewWithLlm(analysis30, buildMethodReview(analysis30, locale), auth.user.id, locale),
            generateMethodReviewWithLlm(analysis90, buildMethodReview(analysis90, locale), auth.user.id, locale)
        ]);
        res.json({ analysis30, analysis90, reviewText: reviewText30, reviewText30, reviewText90, journal });
    } catch (error) {
        console.error('[api] failed to load method analysis', error);
        res.status(500).json({ error: 'Failed to load method analysis' });
    }
});

export default router;
