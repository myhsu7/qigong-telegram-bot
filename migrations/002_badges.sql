CREATE TABLE IF NOT EXISTS telegram_badges (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    emoji VARCHAR(32),
    description TEXT,
    category VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_user_badges (
    telegram_user_id BIGINT NOT NULL REFERENCES telegram_users(telegram_user_id),
    badge_id VARCHAR(64) NOT NULL REFERENCES telegram_badges(id),
    earned_year INTEGER NOT NULL DEFAULT 0,
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (telegram_user_id, badge_id, earned_year)
);

INSERT INTO telegram_badges (id, name, emoji, description, category) VALUES
    ('streak_3', '入門', '🥉', '連續打卡 3 天', 'STREAK'),
    ('streak_7', '小成', '🥈', '連續打卡 7 天', 'STREAK'),
    ('streak_21', '結丹', '🥇', '連續打卡 21 天', 'STREAK'),
    ('streak_100', '百日築基', '💎', '連續打卡 100 天', 'STREAK'),
    ('total_10', '初芽', '🌱', '總計打卡 10 天', 'TOTAL'),
    ('total_100', '大樹', '🌳', '總計打卡 100 天', 'TOTAL'),
    ('time_morning', '晨露', '🌅', '連續 5 天在早上 5:00 - 7:00 打卡', 'TIME_BASED'),
    ('time_night', '夜靜', '🦉', '連續 5 天在晚上 9:00 - 11:00 打卡', 'TIME_BASED'),
    ('seasonal_summer_27', '夏練三伏', '☀️', '夏至過後，連續打卡 27 天', 'SEASONAL'),
    ('seasonal_winter_27', '冬練三九', '❄️', '冬至過後，連續打卡 27 天，且練習龜壽功', 'SEASONAL')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    emoji = EXCLUDED.emoji,
    description = EXCLUDED.description,
    category = EXCLUDED.category;
