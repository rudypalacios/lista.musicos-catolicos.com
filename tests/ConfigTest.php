<?php

declare(strict_types=1);

namespace Tests;

use App\Config;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class ConfigTest extends TestCase
{
    public function testMysqlIsTheDefaultAndNeedsADatabaseName(): void
    {
        $config = Config::fromEnv(['DB_NAME' => 'lista', 'DB_HOST' => 'db.local'], '/app');

        $this->assertSame('mysql:host=db.local;dbname=lista;charset=utf8mb4', $config->dbDsn);
        $this->assertTrue($config->isProduction());

        $this->expectException(InvalidArgumentException::class);
        Config::fromEnv([], '/app');
    }

    public function testSqliteResolvesRelativePathsFromTheRoot(): void
    {
        $config = Config::fromEnv(
            ['DB_DRIVER' => 'sqlite', 'DB_PATH' => 'var/x.sqlite', 'APP_ENV' => 'development'],
            '/app'
        );

        $this->assertSame('sqlite:/app/var/x.sqlite', $config->dbDsn);
        $this->assertFalse($config->isProduction());
    }

    public function testTheLinksAndTheMailboxHaveSafeDefaults(): void
    {
        $default = Config::fromEnv(['DB_NAME' => 'lista'], '/app');
        $own = Config::fromEnv(['DB_NAME' => 'lista', 'APP_URL' => 'https://x.test/'], '/app');
        $mail = Config::fromEnv(
            ['DB_NAME' => 'lista', 'SMTP_HOST' => 'mail.x.test', 'SMTP_USERNAME' => 'a@x.test', 'SMTP_SECURE' => 'tls'],
            '/app'
        )->mail;

        $this->assertSame(Config::PRODUCTION_URL, $default->appUrl);
        $this->assertFalse($default->mail->canSend());
        $this->assertSame('noreply@musicos-catolicos.com', $default->mail->from);
        $this->assertSame('https://x.test', $own->appUrl);
        $this->assertTrue($mail->canSend());
        $this->assertSame([587, 'tls'], [$mail->port, $mail->secure]);
    }

    public function testBlankValuesCountAsMissing(): void
    {
        $config = Config::fromEnv(['DB_NAME' => 'lista', 'OWNER_EMAIL' => '  ', 'DB_PASSWORD' => ''], '/app');

        $this->assertNull($config->ownerEmail);
        $this->assertSame('', $config->dbPassword);
    }

    public function testAnUnknownDriverIsRejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Config::fromEnv(['DB_DRIVER' => 'oracle'], '/app');
    }
}
