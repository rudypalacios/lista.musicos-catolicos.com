<?php

declare(strict_types=1);

namespace App\Database;

use PDO;
use PDOException;
use RuntimeException;

/**
 * Applies the numbered .sql files of migrations/ that the database has not seen, in order.
 * A file named "0003_name.mysql.sql" (or ".sqlite.sql") is for that database only and is
 * skipped by the other: the common subset covers most things, not table charsets.
 *
 * The site is on shared hosting with no shell and the CI only deploys, so the app migrates
 * itself on the first request after a deploy. MySQL commits DDL on its own, so a file is
 * recorded only after it ran, and files must be safe to run twice (CREATE TABLE IF NOT
 * EXISTS): that is what makes two simultaneous first requests harmless.
 */
final class Migrator
{
    public function __construct(private readonly PDO $pdo, private readonly string $directory)
    {
    }

    /**
     * @return list<string> the versions applied by this call (file names without .sql)
     */
    public function migrate(): array
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS schema_migrations ('
            . 'version VARCHAR(190) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL)'
        );

        $applied = Query::column($this->pdo, 'SELECT version FROM schema_migrations');
        $done = [];

        foreach ($this->files() as $version => $file) {
            if (in_array($version, $applied, true)) {
                continue;
            }
            foreach ($this->statements($file) as $statement) {
                $this->pdo->exec($statement);
            }
            $this->record($version);
            $done[] = $version;
        }

        return $done;
    }

    /** The latest applied version, or null on an empty database */
    public function currentVersion(): ?string
    {
        $version = Query::scalar($this->pdo, 'SELECT MAX(version) FROM schema_migrations');

        return is_string($version) ? $version : null;
    }

    /**
     * @return array<string, string> version => path, in order
     */
    private function files(): array
    {
        $paths = glob($this->directory . '/*.sql') ?: [];
        sort($paths);
        $driver = (string) $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);

        $files = [];
        foreach ($paths as $path) {
            $version = basename($path, '.sql');
            if (preg_match('~\.(mysql|sqlite)$~', $version, $only) === 1 && $only[1] !== $driver) {
                continue;
            }
            $files[$version] = $path;
        }

        return $files;
    }

    /**
     * @return list<string>
     */
    private function statements(string $file): array
    {
        $sql = file_get_contents($file);
        if ($sql === false) {
            throw new RuntimeException('Cannot read migration ' . $file);
        }
        // Drop "-- ..." comment lines, then split where a line ends with ";"
        $sql = (string) preg_replace('~^\s*--.*$~m', '', $sql);
        $parts = preg_split('~;\s*(?:\R|$)~', $sql) ?: [];

        return array_values(array_filter(array_map('trim', $parts), static fn (string $part): bool => $part !== ''));
    }

    private function record(string $version): void
    {
        try {
            $this->pdo
                ->prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
                ->execute([$version, gmdate('Y-m-d H:i:s')]);
        } catch (PDOException $e) {
            // A simultaneous request recorded it first: same result
            $message = strtolower($e->getMessage());
            if (!str_contains($message, 'duplicate') && !str_contains($message, 'unique')) {
                throw $e;
            }
        }
    }
}
