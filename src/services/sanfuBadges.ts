import cron from 'node-cron';
import moment from 'moment-timezone';
import { db } from '../db';
import { getSanFuPeriod } from '../utils/sanfu';

const TIMEZONE = 'Asia/Taipei';

export const reconcileSanFuBadges = async (year: number) => {
    const period = getSanFuPeriod(year);
    if (!period) throw new Error(`Sanfu period not found for ${year}`);

    const { rows } = await db.query(
        `INSERT INTO telegram_user_badges (telegram_user_id, badge_id, earned_year)
         SELECT telegram_user_id, 'seasonal_summer_27', $4
         FROM telegram_checkin_logs
         WHERE checkin_date BETWEEN $1::date AND $2::date
         GROUP BY telegram_user_id
         HAVING COUNT(DISTINCT checkin_date) >= $3
         ON CONFLICT DO NOTHING
         RETURNING telegram_user_id`,
        [
            period.start.format('YYYY-MM-DD'),
            period.end.format('YYYY-MM-DD'),
            period.totalDays,
            year
        ]
    );
    return rows.length;
};

export const reconcileLatestCompletedSanFuBadges = async (now = moment().tz(TIMEZONE)) => {
    const currentPeriod = getSanFuPeriod(now.year());
    const year = currentPeriod && now.isAfter(currentPeriod.end, 'day') ? now.year() : now.year() - 1;
    return { year, awarded: await reconcileSanFuBadges(year) };
};

export const setupSanFuBadgeReconciliation = () => {
    const reconcile = () => reconcileLatestCompletedSanFuBadges()
        .then(({ year, awarded }) => console.log(`[sanfu-badges] reconciled year=${year} awarded=${awarded}`))
        .catch((error) => console.error('[sanfu-badges] reconciliation failed', error));

    cron.schedule('10 0 * * *', reconcile, { timezone: TIMEZONE });
    reconcile();
};
