-- The state of a song: 'draft' (still being written; the lists mark it "Borrador") or 'published'. It is a field of
-- the record, so it travels and is compared (newest edit wins) with the rest of the song. Every song that exists
-- starts as 'published': nothing the owner already has changes how it looks.
-- ADD COLUMN has no IF NOT EXISTS in the common subset: the Migrator treats "duplicate column" on an
-- ALTER TABLE ... ADD COLUMN as already done (a simultaneous first request ran it).
ALTER TABLE songs ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'published';
