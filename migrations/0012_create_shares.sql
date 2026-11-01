-- Sharing a setlist by a link anyone can open (read only). A share is the secret code in the link (128 random bits as
-- 32 hex characters, so no case-sensitivity trap in MySQL), the list it shows and whether the lyrics and chords go
-- with it. Stopping a share sets revoked_at: its code never works again, and sharing the list again makes a new one.
-- No index, for the reason given in 0002 (the code is the primary key; a person has a handful of shares).
CREATE TABLE IF NOT EXISTS shares (
    code CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    setlist_id CHAR(36) NOT NULL,
    with_lyrics SMALLINT NOT NULL,
    created_at BIGINT NOT NULL,
    revoked_at BIGINT NULL
);

-- The links that did not lead anywhere, per address, so a page that anyone can ask cannot be used to search for codes
-- or to load the server with guesses (like login_attempts, which does the same for passwords).
CREATE TABLE IF NOT EXISTS share_misses (
    ip VARCHAR(45) NOT NULL,
    attempted_at DATETIME NOT NULL
);
