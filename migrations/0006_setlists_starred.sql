-- A setlist can be starred ("destacado"): the lists screen shows the starred ones first. It is a
-- field of the record, not a separate table, so a star travels and is compared (newest edit wins)
-- with the rest of the list. 0 or 1; every list that exists starts unstarred.
-- ADD COLUMN has no IF NOT EXISTS in the common subset: the Migrator treats "duplicate column" on an
-- ALTER TABLE ... ADD COLUMN as already done (a simultaneous first request ran it).
ALTER TABLE setlists ADD COLUMN starred SMALLINT NOT NULL DEFAULT 0;
