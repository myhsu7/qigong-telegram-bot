BEGIN;

CREATE TABLE IF NOT EXISTS telegram_active_groups (
    chat_id BIGINT PRIMARY KEY,
    chat_type VARCHAR(16) NOT NULL CHECK (chat_type IN ('group', 'supergroup')),
    title TEXT,
    username TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_sent_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_telegram_active_groups_active
    ON telegram_active_groups (chat_id)
    WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS telegram_group_dispatches (
    id BIGSERIAL PRIMARY KEY,
    dispatch_key TEXT UNIQUE NOT NULL,
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('daily', 'resend', 'broadcast')),
    message_text TEXT NOT NULL,
    requested_by BIGINT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_group_deliveries (
    dispatch_id BIGINT NOT NULL REFERENCES telegram_group_dispatches(id) ON DELETE CASCADE,
    chat_id BIGINT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'permanent_failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (dispatch_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_group_deliveries_pending
    ON telegram_group_deliveries (next_attempt_at, dispatch_id, chat_id)
    WHERE status = 'pending';

COMMIT;
