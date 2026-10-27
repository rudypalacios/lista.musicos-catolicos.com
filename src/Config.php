<?php

declare(strict_types=1);

namespace App;

use InvalidArgumentException;

/**
 * Settings read from the environment (.env on the server). Built once at boot and passed
 * to whoever needs it, so nothing else reads $_ENV.
 */
final class Config
{
    public const DRIVER_MYSQL = 'mysql';
    public const DRIVER_SQLITE = 'sqlite';

    /**
     * @param self::DRIVER_* $dbDriver
     */
    public function __construct(
        public readonly string $appEnv,
        public readonly string $dbDriver,
        public readonly string $dbDsn,
        public readonly string $dbUsername,
        public readonly string $dbPassword,
        public readonly ?string $ownerEmail,
        public readonly ?string $ownerPassword,
        public readonly ?string $ownerPasswordHash,
    ) {
    }

    /**
     * @param array<string, mixed> $env
     *
     * @throws InvalidArgumentException when a setting the chosen database needs is missing
     */
    public static function fromEnv(array $env, string $rootDir): self
    {
        $driver = self::string($env, 'DB_DRIVER') ?? self::DRIVER_MYSQL;

        if ($driver === self::DRIVER_SQLITE) {
            $path = self::string($env, 'DB_PATH') ?? 'var/lista.sqlite';
            $dsn = 'sqlite:' . ($path === ':memory:' || str_starts_with($path, '/') ? $path : $rootDir . '/' . $path);
        } elseif ($driver === self::DRIVER_MYSQL) {
            $name = self::string($env, 'DB_NAME');
            if ($name === null) {
                throw new InvalidArgumentException('DB_NAME is not set');
            }
            $host = self::string($env, 'DB_HOST') ?? 'localhost';
            $dsn = 'mysql:host=' . $host . ';dbname=' . $name . ';charset=utf8mb4';
        } else {
            throw new InvalidArgumentException('Unknown DB_DRIVER: ' . $driver);
        }

        return new self(
            self::string($env, 'APP_ENV') ?? 'production',
            $driver,
            $dsn,
            self::string($env, 'DB_USERNAME') ?? '',
            self::string($env, 'DB_PASSWORD') ?? '',
            self::string($env, 'OWNER_EMAIL'),
            self::string($env, 'OWNER_PASSWORD'),
            self::string($env, 'OWNER_PASSWORD_HASH'),
        );
    }

    public function isProduction(): bool
    {
        return $this->appEnv === 'production';
    }

    /**
     * @param array<string, mixed> $env
     */
    private static function string(array $env, string $key): ?string
    {
        $value = $env[$key] ?? null;

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
