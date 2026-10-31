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

    public function testTheMigrationOfTheSectionsRemovesTheListsThatHaveNone(): void
    {
        $dir = sys_get_temp_dir() . '/migrations-' . bin2hex(random_bytes(4));
        mkdir($dir);
        foreach (glob(TestDatabase::MIGRATIONS . '/*.sql') ?: [] as $file) {
            if (basename($file) < '0008') {
                copy($file, $dir . '/' . basename($file));
            }
        }
        $pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        (new Migrator($pdo, $dir))->migrate();
        $pdo->exec(
            'INSERT INTO setlists (id, user_id, title, notes, items, updated_at, seq) '
            . "VALUES ('l1', 'u', 'Misa antigua', '', '[]', 1, 1)"
        );

        copy(TestDatabase::MIGRATIONS . '/0008_setlists_parts.sql', $dir . '/0008_setlists_parts.sql');
        (new Migrator($pdo, $dir))->migrate();

        $count = static fn (): int => (int) $pdo->query('SELECT COUNT(*) FROM setlists')->fetchColumn();
        $this->assertSame(0, $count(), 'a list with no sections is gone');
        $pdo->exec(
            'INSERT INTO setlists (id, user_id, title, notes, items, parts, updated_at, seq) '
            . "VALUES ('l2', 'u', 'Misa nueva', '', '[]', '[{\"id\":\"a\",\"name\":\"A\"}]', 2, 2)"
        );
        $pdo->exec("DELETE FROM schema_migrations WHERE version = '0008_setlists_parts'");
        (new Migrator($pdo, $dir))->migrate();
        $this->assertSame(1, $count(), 'running it again keeps a list that has sections');
    }

    public function testItCreatesTheTables(): void
    {
        $pdo = TestDatabase::migrated();

        $tables = ['users', 'sessions', 'login_attempts', 'songs', 'setlists', 'sync_state', 'schema_migrations'];
        foreach ($tables as $table) {
            $this->assertTrue(TestDatabase::hasTable($pdo, $table), $table);
        }
    }

    public function testAFileNamedForOneDatabaseIsSkippedByTheOther(): void
    {
        $dir = sys_get_temp_dir() . '/migrations-' . bin2hex(random_bytes(4));
        mkdir($dir);
        file_put_contents($dir . '/0001_a.sql', 'CREATE TABLE a (id INTEGER);');
        file_put_contents($dir . '/0002_only_mysql.mysql.sql', 'ALTER TABLE a CONVERT TO CHARACTER SET utf8mb4;');
        file_put_contents($dir . '/0003_only_sqlite.sqlite.sql', 'CREATE TABLE b (id INTEGER);');
        $pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

        $applied = (new Migrator($pdo, $dir))->migrate();

        $this->assertSame(['0001_a', '0003_only_sqlite.sqlite'], $applied, 'the MySQL file is not even tried');
        $this->assertTrue(TestDatabase::hasTable($pdo, 'b'));

        array_map('unlink', glob($dir . '/*.sql') ?: []);
        rmdir($dir);
    }

    public function testEveryTableEndsUpUtf8mb4OnMysql(): void
    {
        if (!TestDatabase::isMysql()) {
            $this->markTestSkipped('Table charsets only exist on MySQL: run with TEST_MYSQL_DSN');
        }

        $collations = TestDatabase::migrated()
            ->query('SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()')
            ->fetchAll(PDO::FETCH_KEY_PAIR);

        $this->assertNotEmpty($collations);
        foreach ($collations as $table => $collation) {
            $this->assertStringStartsWith('utf8mb4_', (string) $collation, (string) $table);
        }
    }

    public function testAddingAColumnThatAlreadyExistsCountsAsDone(): void
    {
        $dir = sys_get_temp_dir() . '/migrations-' . bin2hex(random_bytes(4));
        mkdir($dir);
        file_put_contents($dir . '/0001_a.sql', 'CREATE TABLE a (id INTEGER);');
        file_put_contents($dir . '/0002_more.sql', 'ALTER TABLE a ADD COLUMN extra SMALLINT NOT NULL DEFAULT 0;');
        $pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        // A simultaneous first request ran 0002 before this one got to it
        $pdo->exec('CREATE TABLE a (id INTEGER, extra SMALLINT NOT NULL DEFAULT 0)');
        $pdo->exec(
            'CREATE TABLE schema_migrations (version VARCHAR(190) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL)'
        );
        $pdo->exec("INSERT INTO schema_migrations VALUES ('0001_a', '2026-01-01 00:00:00')");

        $applied = (new Migrator($pdo, $dir))->migrate();

        $this->assertSame(['0002_more'], $applied);

        array_map('unlink', glob($dir . '/*.sql') ?: []);
        rmdir($dir);
    }

    public function testAnyOtherFailingStatementStillStopsTheMigration(): void
    {
        $dir = sys_get_temp_dir() . '/migrations-' . bin2hex(random_bytes(4));
        mkdir($dir);
        file_put_contents($dir . '/0001_a.sql', 'ALTER TABLE missing ADD COLUMN extra SMALLINT;');
        $pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

        try {
            $this->expectException(\PDOException::class);
            (new Migrator($pdo, $dir))->migrate();
        } finally {
            array_map('unlink', glob($dir . '/*.sql') ?: []);
            rmdir($dir);
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
