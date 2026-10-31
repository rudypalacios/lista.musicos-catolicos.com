-- A template: the sections a new list starts with, under a name ("Misa", "Rosario"). Like a setlist it is a single
-- record, its sections traveling inside it as JSON, and it shares the per-user change counter (sync_state) with songs
-- and setlists, so one cursor covers everything. A list copies the sections when it is made: a template never changes
-- a list that exists. The Misa is not here from the start: the app makes it the first time (a record with a fixed id).
-- No index, for the reason given in 0002.
CREATE TABLE IF NOT EXISTS templates (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    name VARCHAR(190) NOT NULL,
    parts TEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT NULL,
    seq BIGINT NOT NULL
);
