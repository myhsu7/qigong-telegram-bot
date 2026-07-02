ALTER TABLE telegram_users
    ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS reminder_hour SMALLINT DEFAULT 20,
    ADD COLUMN IF NOT EXISTS reminder_timezone TEXT DEFAULT 'Asia/Taipei';

UPDATE telegram_users
SET reminder_enabled = COALESCE(reminder_enabled, TRUE),
    reminder_hour = COALESCE(reminder_hour, 20),
    reminder_timezone = COALESCE(reminder_timezone, 'Asia/Taipei')
WHERE reminder_enabled IS NULL
   OR reminder_hour IS NULL
   OR reminder_timezone IS NULL;
