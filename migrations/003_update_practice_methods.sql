INSERT INTO practice_methods (code, name_zh, name_en, estimated_minutes, sort_order)
VALUES
    ('dayan', '大雁功', 'Dayan Qigong', 20, 10),
    ('wuqinxi', '五禽戲', 'Wuqinxi', 20, 20),
    ('huichun', '回春功', 'Huichun Gong', 20, 30),
    ('guishou', '龜壽功', 'Guishou Gong', 20, 40),
    ('zhengyang', '正陽功', 'Zhengyang Gong', 20, 50),
    ('huanghai', '神奇晃海功', 'Magic Swaying Sea Gong', 20, 60),
    ('lotus', '蓮花養心法', 'Lotus Heart Nourishing Method', 20, 70),
    ('heqi', '和氣舒壓法', 'Heqi Relaxation Method', 20, 80),
    ('sanwo', '三窩功', 'Sanwo Gong', 20, 90),
    ('liuyin', '六音理臟法', 'Liuyin Organ Tuning Method', 20, 100)
ON CONFLICT (code) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    name_en = EXCLUDED.name_en,
    estimated_minutes = EXCLUDED.estimated_minutes,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

-- Keep older/removed methods inactive instead of deleting them, preserving historical selections.
UPDATE practice_methods
SET is_active = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE code NOT IN (
    'dayan',
    'wuqinxi',
    'huichun',
    'guishou',
    'zhengyang',
    'huanghai',
    'lotus',
    'heqi',
    'sanwo',
    'liuyin'
);
