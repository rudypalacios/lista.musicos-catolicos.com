<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Database\Migrator;
use PDO;

/**
 * A migrated database for a test. In-memory SQLite by default (fast, nothing to set up).
 * With TEST_MYSQL_DSN (and optionally TEST_MYSQL_USER, TEST_MYSQL_PASSWORD) the same tests
 * run against MySQL, which is what production uses: do that whenever a migration or a query
 * changes, because the two dialects differ where it hurts (types, upserts, DDL).
 *
 *     TEST_MYSQL_DSN='mysql:host=127.0.0.1;dbname=lista_test' vendor/bin/phpunit
 *
 * The MySQL database is emptied first: use a throwaway one.
 */
final class TestDatabase
{
    public const MIGRATIONS = __DIR__ . '/../../migrations';

    public static function migrated(): PDO
    {
        $pdo = self::connect();
        (new Migrator($pdo, self::MIGRATIONS))->migrate();

        return $pdo;
    }

    public static function isMysql(): bool
    {
        return getenv('TEST_MYSQL_DSN') !== false;
    }

    private static function connect(): PDO
    {
        $options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
        $dsn = getenv('TEST_MYSQL_DSN');
        if ($dsn === false) {
            return new PDO('sqlite::memory:', null, null, $options);
        }

        $pdo = new PDO(
            $dsn,
            (string) getenv('TEST_MYSQL_USER') ?: 'lista',
            (string) getenv('TEST_MYSQL_PASSWORD') ?: 'lista',
            $options + [PDO::ATTR_EMULATE_PREPARES => false]
        );
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
            $pdo->exec('DROP TABLE `' . $table . '`');
        }

        return $pdo;
    }

    /** Whether a table exists, whichever database runs the tests */
    public static function hasTable(PDO $pdo, string $table): bool
    {
        try {
            $pdo->query('SELECT 1 FROM ' . $table)->fetchAll();

            return true;
        } catch (\PDOException) {
            return false;
        }
    }
}
