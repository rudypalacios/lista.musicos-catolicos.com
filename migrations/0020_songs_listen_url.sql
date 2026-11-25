-- A link to hear the original of a song (YouTube or anything else, `https://…`), '' for none. It is a field of the record,
-- so it travels and is compared (newest edit wins) with the rest of the song. Every song that exists starts without one.
-- ADD COLUMN has no IF NOT EXISTS in the common subset: the Migrator treats "duplicate column" on an
-- ALTER TABLE ... ADD COLUMN as already done (a simultaneous first request ran it).
ALTER TABLE songs ADD COLUMN listen_url VARCHAR(500) NOT NULL DEFAULT '';
