BEGIN;

ALTER TABLE telegram_users
    ADD COLUMN IF NOT EXISTS interface_locale VARCHAR(5),
    ADD COLUMN IF NOT EXISTS language_selected BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE telegram_users
SET interface_locale = CASE
    WHEN LOWER(REPLACE(COALESCE(language_code, ''), '_', '-')) ~ '^en($|-)' THEN 'en'
    WHEN LOWER(REPLACE(COALESCE(language_code, ''), '_', '-')) ~ '^zh-(hans|cn|sg)($|-)' THEN 'zh_CN'
    ELSE 'zh_TW'
END
WHERE interface_locale IS NULL;

ALTER TABLE telegram_users
    ALTER COLUMN interface_locale SET DEFAULT 'zh_TW',
    ALTER COLUMN interface_locale SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'telegram_users_interface_locale_check'
    ) THEN
        ALTER TABLE telegram_users
            ADD CONSTRAINT telegram_users_interface_locale_check
            CHECK (interface_locale IN ('zh_TW', 'zh_CN', 'en'));
    END IF;
END $$;

ALTER TABLE practice_methods
    ADD COLUMN IF NOT EXISTS name_zh_cn VARCHAR(255);

ALTER TABLE practice_methods
    ALTER COLUMN name_zh_cn DROP NOT NULL;

UPDATE practice_methods SET name_zh_cn = CASE code
    WHEN 'dayan' THEN '大雁功'
    WHEN 'dayan_chu' THEN '大雁初'
    WHEN 'dayan_gao' THEN '大雁高'
    WHEN 'wuqinxi' THEN '五禽戏'
    WHEN 'wuqinxi_he' THEN '鹤戏'
    WHEN 'wuqinxi_yuan' THEN '猿戏'
    WHEN 'wuqinxi_hu' THEN '虎戏'
    WHEN 'wuqinxi_xiong' THEN '熊戏'
    WHEN 'wuqinxi_lu' THEN '鹿戏'
    WHEN 'huichun' THEN '回春功'
    WHEN 'huichun_chu' THEN '回春初'
    WHEN 'huichun_zhong' THEN '回春中'
    WHEN 'guishou' THEN '龟寿功'
    WHEN 'guishou_bagua' THEN '八卦功'
    WHEN 'guishou_qiankun' THEN '乾坤功'
    WHEN 'guishou_fengxiang_guishuo' THEN '凤翔与龟缩'
    WHEN 'zhengyang' THEN '正阳功'
    WHEN 'zhengyang_morning' THEN '晨功'
    WHEN 'zhengyang_night' THEN '夜功'
    WHEN 'huanghai' THEN '神奇晃海功'
    WHEN 'lotus' THEN '莲花养心法'
    WHEN 'heqi' THEN '和气舒压法'
    WHEN 'sanwo' THEN '三窝功'
    WHEN 'liuyin' THEN '六音理脏法'
    WHEN 'jinggong' THEN '静功'
    WHEN 'jinggong_zhoutian' THEN '周天静功'
    WHEN 'jinggong_qixing' THEN '七星心法'
    WHEN 'jinggong_songjing' THEN '松静功'
    ELSE name_zh
END;

UPDATE practice_methods SET name_en = CASE code
    WHEN 'dayan' THEN 'EnerQi Dayan'
    WHEN 'dayan_chu' THEN 'EnerQi Dayan Beginner'
    WHEN 'dayan_gao' THEN 'EnerQi Dayan Advanced'
    WHEN 'huichun' THEN 'YoungQi Huichun'
    WHEN 'huichun_chu' THEN 'YoungQi Huichun Beginner'
    WHEN 'huichun_zhong' THEN 'YoungQi Huichun Intermediate'
    WHEN 'wuqinxi' THEN 'Five Animal Frolics Wuqinxi'
    WHEN 'guishou' THEN 'Longevity Guishou'
    WHEN 'zhengyang' THEN 'VitalQi'
    WHEN 'huanghai' THEN 'FlowQi-Neuro'
    WHEN 'lotus' THEN 'LotusQi'
    WHEN 'heqi' THEN 'HarmonyQi'
    WHEN 'jinggong_zhoutian' THEN 'Circulatory Tranquility Technique Zhoutian'
    WHEN 'jinggong_qixing' THEN 'Bio-Alignment Technique Qixing'
    WHEN 'liuyin' THEN 'DetoxQi Liuyin'
    ELSE name_en
END;

INSERT INTO practice_methods (
    code, name_zh, name_zh_cn, name_en, estimated_minutes, sort_order, parent_id, method_type, is_active
) VALUES (
    'wujing_shenghua', '五靜昇華', '五静升华', 'Stillness 5', 20, 105, NULL, 'leaf', TRUE
)
ON CONFLICT (code) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    name_zh_cn = EXCLUDED.name_zh_cn,
    name_en = EXCLUDED.name_en,
    estimated_minutes = EXCLUDED.estimated_minutes,
    sort_order = EXCLUDED.sort_order,
    parent_id = EXCLUDED.parent_id,
    method_type = EXCLUDED.method_type,
    is_active = EXCLUDED.is_active;

COMMIT;
