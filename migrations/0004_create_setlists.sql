-- A setlist (the music of one Mass) is a single record: its items travel inside it as JSON, so
-- the whole list is what the newest-edit-wins rule compares and what a sync moves. Dates are
-- text (YYYY-MM-DD, the day of the Mass, no time zone to get wrong); times are epoch
-- milliseconds, as in songs. It shares the per-user change counter (sync_state) with songs, so
-- one cursor covers everything. No index, for the reason given in 0002.
CREATE TABLE IF NOT EXISTS setlists (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    title VARCHAR(190) NOT NULL,
    event_date CHAR(10) NULL,
    notes TEXT NOT NULL,
    items TEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT NULL,
    seq BIGINT NOT NULL
);
