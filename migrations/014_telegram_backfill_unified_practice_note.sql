BEGIN;

SET LOCAL statement_timeout = '0';

UPDATE telegram_checkin_logs
SET practice_note = CASE
    WHEN COALESCE(BTRIM(reflection_note, E' \t\n\r'), '') <> ''
         AND COALESCE(BTRIM(body_feeling_note, E' \t\n\r'), '') <> ''
        THEN BTRIM(reflection_note, E' \t\n\r')
             || E'\n' || BTRIM(body_feeling_note, E' \t\n\r')
    WHEN COALESCE(BTRIM(reflection_note, E' \t\n\r'), '') <> ''
        THEN BTRIM(reflection_note, E' \t\n\r')
    WHEN COALESCE(BTRIM(body_feeling_note, E' \t\n\r'), '') <> ''
        THEN BTRIM(body_feeling_note, E' \t\n\r')
    ELSE NULL
END
WHERE practice_note IS NULL
  AND (
      COALESCE(BTRIM(reflection_note, E' \t\n\r'), '') <> ''
      OR COALESCE(BTRIM(body_feeling_note, E' \t\n\r'), '') <> ''
  );

COMMIT;
