-- Signing in with Google (open sign-up, step 4). Written for MySQL and SQLite (the common subset), see the notes in 0001.

-- Which outside account a user signs in with. The key is what Google calls "sub": it never changes, while the email can.
-- A person may have both a password and an identity. `provider` is a word ('google'), kept short so the key stays small on
-- MySQL with 4-byte characters (the subject is 21 digits in practice; the app refuses one longer than the column).
CREATE TABLE IF NOT EXISTS identities (
    provider VARCHAR(8) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    user_id CHAR(36) NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (provider, subject)
);

-- A sign-in that was started and has not come back yet: only the hashes of the `state` the person carries to Google and of
-- the cookie that ties it to this browser (so a link someone else started cannot sign this browser in), plus what the
-- server needs to finish it. A row lives 10 minutes, works once and is deleted when it is used or the next one starts.
CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash CHAR(64) NOT NULL PRIMARY KEY,
    binding_hash CHAR(64) NOT NULL,
    verifier VARCHAR(128) NOT NULL,
    nonce CHAR(32) NOT NULL,
    expires_at BIGINT NOT NULL
);
