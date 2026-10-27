-- Written for MySQL (production) and SQLite (local development and tests): keep to the
-- common subset, no engine or index clauses, one `;` per statement.
CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) NOT NULL PRIMARY KEY,
    email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
    ip VARCHAR(45) NOT NULL,
    attempted_at DATETIME NOT NULL
);
