-- Accounts of other people (open sign-up): a person proves they own their email, and can recover a forgotten password by it.
-- Written for MySQL and SQLite (the common subset), see the notes in 0001.

-- When the account's email was confirmed (epoch ms), or NULL while it is not. The accounts that exist when this runs (the
-- owner's) are taken as confirmed: 1 means "before there was a check". The owner's is also created confirmed on a new install.
ALTER TABLE users ADD COLUMN email_verified_at BIGINT NULL;

UPDATE users SET email_verified_at = 1 WHERE email_verified_at IS NULL;

-- The links sent by email: to confirm the address ('verify') and to choose a new password ('reset'). Only the hash of the
-- code is kept, like a session's, so a leaked database cannot be used to take over an account. A code works once.
CREATE TABLE IF NOT EXISTS email_tokens (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    purpose VARCHAR(16) NOT NULL,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL
);

-- What was asked of an address or an account, to say "wait" to one that asks too often (sign-ups, password resets, resent
-- confirmations). Rows older than the longest window are deleted as they are counted, so it stays small: no index.
CREATE TABLE IF NOT EXISTS rate_events (
    kind VARCHAR(24) NOT NULL,
    subject VARCHAR(190) NOT NULL,
    happened_at BIGINT NOT NULL
);

-- The proofs of work already spent, until their challenge expires: a solved challenge opens one sign-up, not a thousand.
CREATE TABLE IF NOT EXISTS pow_spent (
    challenge_hash CHAR(64) NOT NULL PRIMARY KEY,
    expires_at BIGINT NOT NULL
);

-- Secrets the app makes for itself the first time it needs them (it signs the challenges with one), so nobody has to
-- put them in .env by hand.
CREATE TABLE IF NOT EXISTS app_secrets (
    name VARCHAR(64) NOT NULL PRIMARY KEY,
    secret CHAR(64) NOT NULL
);
