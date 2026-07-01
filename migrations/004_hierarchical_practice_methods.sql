ALTER TABLE practice_methods
    ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES practice_methods(id),
    ADD COLUMN IF NOT EXISTS method_type VARCHAR(16);

UPDATE practice_methods
SET method_type = COALESCE(method_type, 'leaf')
WHERE method_type IS NULL;

INSERT INTO practice_methods (code, name_zh, name_en, estimated_minutes, sort_order, parent_id, method_type)
VALUES
    ('dayan', '大雁功', 'Dayan Qigong', 20, 10, NULL, 'group'),
    ('wuqinxi', '五禽戲', 'Wuqinxi', 20, 20, NULL, 'group'),
    ('huichun', '回春功', 'Huichun Gong', 20, 30, NULL, 'group'),
    ('guishou', '龜壽功', 'Guishou Gong', 20, 40, NULL, 'group'),
    ('zhengyang', '正陽功', 'Zhengyang Gong', 20, 50, NULL, 'group'),
    ('huanghai', '神奇晃海功', 'Magic Swaying Sea Gong', 20, 60, NULL, 'leaf'),
    ('lotus', '蓮花養心法', 'Lotus Heart Nourishing Method', 20, 70, NULL, 'leaf'),
    ('heqi', '和氣舒壓法', 'Heqi Relaxation Method', 20, 80, NULL, 'leaf'),
    ('sanwo', '三窩功', 'Sanwo Gong', 20, 90, NULL, 'leaf'),
    ('liuyin', '六音理臟法', 'Liuyin Organ Tuning Method', 20, 100, NULL, 'leaf'),
    ('jinggong', '靜功', 'Quiet Practice', 20, 110, NULL, 'group')
ON CONFLICT (code) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    name_en = EXCLUDED.name_en,
    estimated_minutes = EXCLUDED.estimated_minutes,
    sort_order = EXCLUDED.sort_order,
    parent_id = EXCLUDED.parent_id,
    method_type = EXCLUDED.method_type,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO practice_methods (code, name_zh, name_en, estimated_minutes, sort_order, parent_id, method_type)
SELECT child.code, child.name_zh, child.name_en, child.estimated_minutes, child.sort_order, parent.id, 'leaf'
FROM (
    VALUES
        ('dayan_chu', '大雁初', 'Dayan Form 1', 10, 11, 'dayan'),
        ('dayan_gao', '大雁高', 'Dayan Form 2', 10, 12, 'dayan'),
        ('wuqinxi_he', '鶴戲', 'Crane Form', 10, 21, 'wuqinxi'),
        ('wuqinxi_yuan', '猿戲', 'Monkey Form', 10, 22, 'wuqinxi'),
        ('wuqinxi_hu', '虎戲', 'Tiger Form', 10, 23, 'wuqinxi'),
        ('wuqinxi_xiong', '熊戲', 'Bear Form', 10, 24, 'wuqinxi'),
        ('wuqinxi_lu', '鹿戲', 'Deer Form', 10, 25, 'wuqinxi'),
        ('huichun_chu', '回春初', 'Huichun Form 1', 10, 31, 'huichun'),
        ('huichun_zhong', '回春中', 'Huichun Form 2', 10, 32, 'huichun'),
        ('guishou_bagua', '八卦功', 'Bagua Practice', 10, 41, 'guishou'),
        ('guishou_qiankun', '乾坤功', 'Qiankun Practice', 10, 42, 'guishou'),
        ('guishou_fengxiang_guishuo', '鳳翔與龜縮', 'Phoenix and Turtle Form', 10, 43, 'guishou'),
        ('zhengyang_morning', '晨功', 'Morning Practice', 10, 51, 'zhengyang'),
        ('zhengyang_night', '夜功', 'Night Practice', 10, 52, 'zhengyang'),
        ('jinggong_zhoutian', '周天靜功', 'Zhoutian Quiet Practice', 10, 111, 'jinggong'),
        ('jinggong_qixing', '七星心法', 'Seven Star Method', 10, 112, 'jinggong')
) AS child(code, name_zh, name_en, estimated_minutes, sort_order, parent_code)
JOIN practice_methods parent ON parent.code = child.parent_code
ON CONFLICT (code) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    name_en = EXCLUDED.name_en,
    estimated_minutes = EXCLUDED.estimated_minutes,
    sort_order = EXCLUDED.sort_order,
    parent_id = EXCLUDED.parent_id,
    method_type = EXCLUDED.method_type,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

UPDATE practice_methods
SET is_active = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE code NOT IN (
    'dayan',
    'dayan_chu',
    'dayan_gao',
    'wuqinxi',
    'wuqinxi_he',
    'wuqinxi_yuan',
    'wuqinxi_hu',
    'wuqinxi_xiong',
    'wuqinxi_lu',
    'huichun',
    'huichun_chu',
    'huichun_zhong',
    'guishou',
    'guishou_bagua',
    'guishou_qiankun',
    'guishou_fengxiang_guishuo',
    'zhengyang',
    'zhengyang_morning',
    'zhengyang_night',
    'huanghai',
    'lotus',
    'heqi',
    'sanwo',
    'liuyin',
    'jinggong',
    'jinggong_zhoutian',
    'jinggong_qixing'
);
