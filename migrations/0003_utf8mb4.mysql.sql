-- MySQL only (the ".mysql" in the name: SQLite skips it, it has no such thing as a table charset).
-- A database created as plain "utf8" keeps 3 bytes per character, enough for Spanish and for the
-- sharp and flat signs but not for emoji, which would be refused or cut when a song is saved. This
-- converts the tables; it does nothing harmful on a database that is already utf8mb4.
ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE sessions CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE login_attempts CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE songs CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE sync_state CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE schema_migrations CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
