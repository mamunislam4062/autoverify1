-- ============================================================
-- db-setup.sql  —  MySQL schema for the AutosVerify bot
-- ============================================================
-- Data model overview:
--   bot_settings : stores every top-level db.data key EXCEPT 'users'
--                  as a JSON-serialised text value.
--   bot_users    : stores each user object as a JSON row keyed by
--                  the Telegram user_id (BIGINT).
--
-- Run this file once on a fresh database before starting the server,
-- or let the server create the tables automatically on first boot
-- (it issues the same CREATE TABLE IF NOT EXISTS statements at init).
-- ============================================================

-- Table: bot_settings
-- One row per top-level property of db.data (e.g. settings, apiKeys,
-- tasks, cards, featureFlags, …).  The value column holds the full
-- JSON representation of that property.
CREATE TABLE IF NOT EXISTS bot_settings (
    `key`       VARCHAR(255) PRIMARY KEY,
    value       LONGTEXT,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                          ON UPDATE CURRENT_TIMESTAMP
);

-- Table: bot_users
-- One row per Telegram user.  The data column holds the complete
-- user object (balance, history, tasksDone, referrals, …) as JSON.
CREATE TABLE IF NOT EXISTS bot_users (
    user_id     BIGINT PRIMARY KEY,
    data        LONGTEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                          ON UPDATE CURRENT_TIMESTAMP
);
