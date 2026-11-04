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
            [
                'DB_NAME' => 'lista', 'MAIL_HOST' => 'mail.x.test', 'MAIL_USERNAME' => 'a@x.test',
                'MAIL_ENCRYPTION' => 'tls',
            ],
            '/app'
        )->mail;

        $this->assertSame(Config::PRODUCTION_URL, $default->appUrl);
        $this->assertFalse($default->mail->canSend());
        $this->assertSame('noreply@musicos-catolicos.com', $default->mail->from);
        $this->assertSame('https://x.test', $own->appUrl);
        $this->assertTrue($mail->canSend());
        $this->assertSame([587, 'tls'], [$mail->port, $mail->secure]);
    }

    public function testTheMailboxIsReadFromTheNamesOfTheOwnersOtherSystem(): void
    {
        $env = [
            'DB_NAME' => 'lista',
            'MAIL_DRIVER' => 'smtp',
            'MAIL_HOST' => 'mail.musicos-catolicos.com',
            'MAIL_PORT' => '465',
            'MAIL_ENCRYPTION' => 'ssl',
            'MAIL_USERNAME' => 'noreply@musicos-catolicos.com',
            'MAIL_PASSWORD' => 'una clave',
            'MAIL_FROM_ADDRESS' => 'noreply@musicos-catolicos.com',
            'MAIL_FROM_NAME' => 'Músicos Católicos ',
            'MAIL_REPLY_TO' => 'contacto@musicos-catolicos.com',
        ];

        $mail = Config::fromEnv($env, '/app')->mail;

        $this->assertTrue($mail->canSend());
        $this->assertSame(
            ['mail.musicos-catolicos.com', 465, 'ssl', 'noreply@musicos-catolicos.com', 'una clave'],
            [$mail->host, $mail->port, $mail->secure, $mail->username, $mail->password]
        );
        $this->assertSame(['noreply@musicos-catolicos.com', 'Músicos Católicos'], [$mail->from, $mail->fromName]);
        $this->assertSame('contacto@musicos-catolicos.com', $mail->replyTo);
    }

    public function testTheEncryptionIsWhatSaidOrWhatThePortMeans(): void
    {
        $with = static fn (array $extra): \App\MailConfig => Config::fromEnv(
            ['DB_NAME' => 'lista', 'MAIL_HOST' => 'h'] + $extra,
            '/app'
        )->mail;

        $this->assertSame('tls', $with(['MAIL_ENCRYPTION' => 'tls'])->secure);
        $this->assertSame('tls', $with(['MAIL_PORT' => '587'])->secure, 'not said: 587 is STARTTLS');
        $this->assertSame('ssl', $with([])->secure, 'not said, no port: SMTPS');
        $this->assertSame(465, $with([])->port);
        $this->assertSame(587, $with(['MAIL_ENCRYPTION' => 'tls'])->port);
        $this->assertSame('', $with(['MAIL_ENCRYPTION' => 'none'])->secure);
    }

    public function testAnotherDriverOrNoHostMeansTheMessageIsOnlyLogged(): void
    {
        $log = Config::fromEnv(['DB_NAME' => 'lista', 'MAIL_HOST' => 'h', 'MAIL_DRIVER' => 'log'], '/app')->mail;
        $none = Config::fromEnv(['DB_NAME' => 'lista', 'MAIL_DRIVER' => 'smtp'], '/app')->mail;

        $this->assertFalse($log->canSend());
        $this->assertFalse($none->canSend());
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
