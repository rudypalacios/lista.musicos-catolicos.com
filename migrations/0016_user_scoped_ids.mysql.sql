-- MySQL only. A song, a list and a template belong to one account, and the same id can now exist in two accounts (the
-- Mass template has a fixed id in every account, and a person who tried the app before signing up brings records with
-- the ids they were given), so the key is the pair (user_id, id) and not the id alone. Nothing is lost: every id was
-- already unique, so it stays unique inside its account. The lookups by id were by user too (src/Sync), so none gets slower.
ALTER TABLE songs DROP PRIMARY KEY, ADD PRIMARY KEY (user_id, id);
ALTER TABLE setlists DROP PRIMARY KEY, ADD PRIMARY KEY (user_id, id);
ALTER TABLE templates DROP PRIMARY KEY, ADD PRIMARY KEY (user_id, id);
