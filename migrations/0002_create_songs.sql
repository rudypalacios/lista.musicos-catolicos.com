-- A song and the counter that orders changes for syncing. Times are epoch milliseconds
-- (BIGINT): the client stamps its own edits, and "which edit is newer" must compare the same
-- way in MySQL and SQLite. No index: SQLite and MySQL spell CREATE INDEX IF NOT EXISTS
-- differently, and a personal library is a few hundred rows. Add one in a MySQL-only
-- migration if that ever stops being true.
CREATE TABLE IF NOT EXISTS songs (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    title VARCHAR(190) NOT NULL,
    author VARCHAR(190) NOT NULL,
    body TEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT NULL,
    seq BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
    user_id CHAR(36) NOT NULL PRIMARY KEY,
    seq BIGINT NOT NULL
);
