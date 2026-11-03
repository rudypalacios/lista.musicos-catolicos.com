-- SQLite only (local development and the tests): the same change as the MySQL file of this number, which SQLite cannot
-- say with ALTER, so each table is rebuilt with the key (user_id, id) and its rows copied. The columns are the ones the
-- migrations 0002, 0004, 0006, 0007, 0008, 0009 and 0011 left.
CREATE TABLE songs_scoped (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    title VARCHAR(190) NOT NULL,
    author VARCHAR(190) NOT NULL,
    body TEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT NULL,
    seq BIGINT NOT NULL,
    my_shift SMALLINT NOT NULL DEFAULT 0,
    tags TEXT NULL,
    PRIMARY KEY (user_id, id)
);

INSERT INTO songs_scoped (id, user_id, title, author, body, updated_at, deleted_at, seq, my_shift, tags)
SELECT id, user_id, title, author, body, updated_at, deleted_at, seq, my_shift, tags FROM songs;

DROP TABLE songs;

ALTER TABLE songs_scoped RENAME TO songs;

CREATE TABLE setlists_scoped (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    title VARCHAR(190) NOT NULL,
    event_date CHAR(10) NULL,
    notes TEXT NOT NULL,
    items TEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT NULL,
    seq BIGINT NOT NULL,
    starred SMALLINT NOT NULL DEFAULT 0,
    parts TEXT NULL,
    PRIMARY KEY (user_id, id)
);

INSERT INTO setlists_scoped (id, user_id, title, event_date, notes, items, updated_at, deleted_at, seq, starred, parts)
SELECT id, user_id, title, event_date, notes, items, updated_at, deleted_at, seq, starred, parts FROM setlists;

DROP TABLE setlists;

ALTER TABLE setlists_scoped RENAME TO setlists;

CREATE TABLE templates_scoped (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    name VARCHAR(190) NOT NULL,
    parts TEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT NULL,
    seq BIGINT NOT NULL,
    PRIMARY KEY (user_id, id)
);

INSERT INTO templates_scoped (id, user_id, name, parts, updated_at, deleted_at, seq)
SELECT id, user_id, name, parts, updated_at, deleted_at, seq FROM templates;

DROP TABLE templates;

ALTER TABLE templates_scoped RENAME TO templates;
