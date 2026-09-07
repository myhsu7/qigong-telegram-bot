BEGIN;

ALTER TABLE telegram_checkin_logs
    ADD COLUMN IF NOT EXISTS practice_note TEXT;

CREATE OR REPLACE FUNCTION sync_telegram_practice_note_from_legacy()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.practice_note IS NULL)
       OR (
           TG_OP = 'UPDATE'
           AND NEW.practice_note IS NOT DISTINCT FROM OLD.practice_note
           AND (
               NEW.reflection_note IS DISTINCT FROM OLD.reflection_note
               OR NEW.body_feeling_note IS DISTINCT FROM OLD.body_feeling_note
           )
       ) THEN
        NEW.practice_note := CASE
            WHEN COALESCE(BTRIM(NEW.reflection_note, E' \t\n\r'), '') <> ''
                 AND COALESCE(BTRIM(NEW.body_feeling_note, E' \t\n\r'), '') <> ''
                THEN BTRIM(NEW.reflection_note, E' \t\n\r')
                     || E'\n' || BTRIM(NEW.body_feeling_note, E' \t\n\r')
            WHEN COALESCE(BTRIM(NEW.reflection_note, E' \t\n\r'), '') <> ''
                THEN BTRIM(NEW.reflection_note, E' \t\n\r')
            WHEN COALESCE(BTRIM(NEW.body_feeling_note, E' \t\n\r'), '') <> ''
                THEN BTRIM(NEW.body_feeling_note, E' \t\n\r')
            ELSE NULL
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_telegram_practice_note_from_legacy ON telegram_checkin_logs;
CREATE TRIGGER sync_telegram_practice_note_from_legacy
BEFORE INSERT OR UPDATE OF reflection_note, body_feeling_note, practice_note
ON telegram_checkin_logs
FOR EACH ROW
EXECUTE FUNCTION sync_telegram_practice_note_from_legacy();

COMMIT;
