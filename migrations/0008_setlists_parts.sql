-- The sections of a list ("secciones": the parts a list is made of). Until now every list was a Mass
-- and its 15 parts lived in the app's code; now each list carries its own, as JSON in the record, so
-- the whole list (sections and songs) is what the newest-edit-wins rule compares and a sync moves.
-- A list with no parts is not valid any more: the server refuses it (SetlistChange).
-- The owner chose to start the lists from scratch (2026-10-31: the app has one user and no list he cannot
-- make again), so the lists that exist are removed instead of being converted. The devices drop theirs
-- when they open the new version (IndexedDB version 3). The DELETE only touches rows with no parts, so
-- running it twice, or after the first list of the new version was saved, removes nothing that is valid.
-- ADD COLUMN has no IF NOT EXISTS in the common subset: the Migrator treats "duplicate column" on an
-- ALTER TABLE ... ADD COLUMN as already done (a simultaneous first request ran it). The column is
-- nullable because MySQL before 8.0.13 cannot give a TEXT column a default; the application always writes it.
ALTER TABLE setlists ADD COLUMN parts TEXT NULL;
DELETE FROM setlists WHERE parts IS NULL;
