-- MySQL only: the tables of 0017 are made with the database's default charset, which on a host whose database was made as
-- plain "utf8" has 3 bytes per character (see 0003). The new column of users is a number and needs nothing.
ALTER TABLE email_tokens CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE rate_events CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE pow_spent CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE app_secrets CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
