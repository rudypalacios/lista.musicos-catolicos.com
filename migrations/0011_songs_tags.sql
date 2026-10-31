-- The tags of a song ("Entrada", "Cuaresma"…): free text, at most 8 of at most 30 characters, kept as JSON in the
-- record so they travel and are compared (newest edit wins) with the rest of the song. The picker of a section of a
-- list offers first the songs that carry its tag. A song with none has NULL here and reads as an empty list.
-- ADD COLUMN has no IF NOT EXISTS in the common subset: the Migrator treats "duplicate column" on an
-- ALTER TABLE ... ADD COLUMN as already done (a simultaneous first request ran it). Nullable because MySQL before
-- 8.0.13 cannot give a TEXT column a default; the application always writes it.
ALTER TABLE songs ADD COLUMN tags TEXT NULL;
