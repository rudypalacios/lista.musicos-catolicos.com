-- Deleting an account (the owner's decision, 2026-11-28): the person confirms from a link sent to their email, and the account is
-- kept 3 days, hidden and locked, in case they change their mind; then it is deleted for good.
-- The moment it will be deleted (epoch ms), or NULL while the account is as any other. The request is 3 days before it.
-- Written for MySQL and SQLite (the common subset), see the notes in 0001.
ALTER TABLE users ADD COLUMN delete_after BIGINT NULL;
