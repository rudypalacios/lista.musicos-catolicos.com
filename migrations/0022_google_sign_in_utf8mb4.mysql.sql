-- MySQL only: the tables of 0021 are made with the database's default charset, which on a host whose database was made as
-- plain "utf8" has 3 bytes per character (see 0003).
ALTER TABLE identities CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE oauth_states CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
