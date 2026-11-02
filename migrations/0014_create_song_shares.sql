-- Sharing one song by a link anyone can open (read only), apart from the lists' shares (0012): a song has no "lyrics
-- or not" choice (a song without its words shows nothing), so this table has no such column. Like a list's share, the
-- code is 128 random bits as 32 hex characters, stopping sets revoked_at and sharing again makes a new code. No index,
-- for the reason given in 0002 (the code is the primary key; a person has a handful of shares).
CREATE TABLE IF NOT EXISTS song_shares (
    code CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    song_id CHAR(36) NOT NULL,
    created_at BIGINT NOT NULL,
    revoked_at BIGINT NULL
);
