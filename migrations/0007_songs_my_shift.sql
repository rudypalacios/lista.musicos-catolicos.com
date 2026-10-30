-- "Mi tono": the key a person sings a song in, in semitones from the key it is written in (-11 to 11;
-- 0 is the written key, the same as having none). A song added to a list starts in it. It is a field of
-- the record, so it travels and is compared (newest edit wins) with the rest of the song. Every song
-- that exists starts at 0.
-- ADD COLUMN has no IF NOT EXISTS in the common subset: the Migrator treats "duplicate column" on an
-- ALTER TABLE ... ADD COLUMN as already done (a simultaneous first request ran it).
ALTER TABLE songs ADD COLUMN my_shift SMALLINT NOT NULL DEFAULT 0;
