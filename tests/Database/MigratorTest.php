<?php

declare(strict_types=1);

namespace Tests\Database;

use App\Database\Migrator;
use PDO;
use PHPUnit\Framework\TestCase;
use Tests\Support\TestDatabase;

final class MigratorTest extends TestCase
{
    public function testItAppliesEveryMigrationOnceAndInOrder(): void
    {
        $pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $migrator = new Migrator($pdo, TestDatabase::MIGRATIONS);

        $first = $migrator->migrate();
        $this->assertSame('0001_create_users', $first[0]);
        $this->assertSame([], $migrator->migrate(), 'a second run has nothing left to apply');
        $this->assertSame(end($first), $migrator->currentVersion());
    }

    public function testItCreatesTheTables(): void
    {
        $pdo = TestDatabase::migrated();

        foreach (['users', 'sessions', 'login_attempts', 'songs', 'sync_state', 'schema_migrations'] as $table) {
            $this->assertTrue(TestDatabase::hasTable($pdo, $table), $table);
        }
    }

    public function testCommentsAndSeveralStatementsPerFileAreHandled(): void
    {
        $dir = sys_get_temp_dir() . '/migrations-' . bin2hex(random_bytes(4));
        mkdir($dir);
        file_put_contents(
            $dir . '/0001_a.sql',
            "-- a comment; with a semicolon\nCREATE TABLE a (id INTEGER);\n\nCREATE TABLE b (id INTEGER);\n"
        );
        $pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

        (new Migrator($pdo, $dir))->migrate();

        $tables = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table'")->fetchAll(PDO::FETCH_COLUMN);
        $this->assertContains('a', $tables);
        $this->assertContains('b', $tables);

        unlink($dir . '/0001_a.sql');
        rmdir($dir);
    }
}
