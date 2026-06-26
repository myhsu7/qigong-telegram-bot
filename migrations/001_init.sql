CREATE TABLE IF NOT EXISTS telegram_users (
    id SERIAL PRIMARY KEY,
    telegram_user_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    language_code VARCHAR(32),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS practice_methods (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    name_zh VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    estimated_minutes INTEGER,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_checkin_logs (
    id SERIAL PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL REFERENCES telegram_users(telegram_user_id),
    checkin_date DATE NOT NULL,
    reflection_note TEXT,
    body_feeling_note TEXT,
    note TEXT,
    source VARCHAR(32) DEFAULT 'webapp',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (telegram_user_id, checkin_date)
);

CREATE TABLE IF NOT EXISTS telegram_checkin_method_selections (
    id SERIAL PRIMARY KEY,
    checkin_log_id INTEGER NOT NULL REFERENCES telegram_checkin_logs(id) ON DELETE CASCADE,
    practice_method_id INTEGER NOT NULL REFERENCES practice_methods(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (checkin_log_id, practice_method_id)
);

INSERT INTO practice_methods (code, name_zh, name_en, estimated_minutes, sort_order)
VALUES
    ('dayan', '大雁功', 'Dayan Qigong', 20, 10),
    ('huichun', '回春功', 'Huichun Gong', 20, 20),
    ('guishou', '龜壽功', 'Guishou Gong', 20, 30),
    ('zhengyang', '正陽功', 'Zhengyang Gong', 20, 40),
    ('huanghai', '神奇晃海功', 'Magic Swaying Sea Gong', 20, 50),
    ('heqi', '和氣舒壓法', 'Heqi Relaxation Method', 20, 60),
    ('lotus', '蓮花', 'Lotus Practice', 20, 70)
ON CONFLICT (code) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    name_en = EXCLUDED.name_en,
    estimated_minutes = EXCLUDED.estimated_minutes,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;
