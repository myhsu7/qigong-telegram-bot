BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM practice_methods WHERE code = 'jinggong') THEN
        RAISE EXCEPTION 'Cannot add jinggong_songjing: parent method jinggong does not exist';
    END IF;
END $$;

INSERT INTO practice_methods (code, name_zh, name_en, estimated_minutes, sort_order, parent_id, method_type)
SELECT 'jinggong_songjing', '鬆靜功', 'Songjing Practice', 10, 113, parent.id, 'leaf'
FROM practice_methods parent
WHERE parent.code = 'jinggong'
ON CONFLICT (code) DO UPDATE SET
    name_zh = EXCLUDED.name_zh,
    name_en = EXCLUDED.name_en,
    estimated_minutes = EXCLUDED.estimated_minutes,
    sort_order = EXCLUDED.sort_order,
    parent_id = EXCLUDED.parent_id,
    method_type = EXCLUDED.method_type,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

COMMIT;
