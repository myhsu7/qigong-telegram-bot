INSERT INTO telegram_user_badges (telegram_user_id, badge_id, earned_year)
SELECT telegram_user_id, 'seasonal_summer_27', 2026
FROM telegram_checkin_logs
WHERE checkin_date BETWEEN DATE '2026-07-15' AND DATE '2026-08-23'
GROUP BY telegram_user_id
HAVING COUNT(DISTINCT checkin_date) = 40
ON CONFLICT DO NOTHING;
