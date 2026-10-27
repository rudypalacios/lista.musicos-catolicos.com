<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Database\Migrator;
use PDO;

final class TestDatabase
{
    public const MIGRATIONS = __DIR__ . '/../../migrations';

    /** A fresh in-memory SQLite database with every migration applied */
    public static function migrated(): PDO
    {
        $pdo = new PDO('sqlite::memory:', null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        (new Migrator($pdo, self::MIGRATIONS))->migrate();

        return $pdo;
    }
}
