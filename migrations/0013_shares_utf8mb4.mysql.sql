-- MySQL only. The tables of 0012 are created with the database's default charset, which on a host whose database was
-- made as plain "utf8" has 3 bytes per character (see 0003).
ALTER TABLE shares CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE share_misses CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
