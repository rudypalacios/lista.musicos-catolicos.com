<?php

declare(strict_types=1);

namespace App;

/**
 * How the app sends email: the mailbox of the site it signs in to over SMTP, and who the messages come from. The names
 * of the settings are the ones the owner's other system uses (MAIL_HOST, MAIL_PORT, MAIL_ENCRYPTION, MAIL_USERNAME,
 * MAIL_PASSWORD, MAIL_FROM_ADDRESS, MAIL_FROM_NAME, MAIL_REPLY_TO, MAIL_DRIVER), so one .env reads the same in both.
 * With no host, or with MAIL_DRIVER=log, the app does not send: it writes the message to the error log instead
 * (development, tests, and a server whose .env does not have the mailbox yet), so a missing setting never takes the
 * sign-up down.
 */
final class MailConfig
{
    public const DEFAULT_FROM = 'noreply@musicos-catolicos.com';
    public const DEFAULT_FROM_NAME = 'Listas · Músicos Católicos';

    /**
     * @param 'ssl'|'tls'|'' $secure "ssl" is SMTPS (port 465), "tls" is STARTTLS (port 587), "" is none (a local
     * test server)
     */
    public function __construct(
        public readonly ?string $host = null,
        public readonly int $port = 465,
        public readonly string $secure = 'ssl',
        public readonly ?string $username = null,
        public readonly ?string $password = null,
        public readonly string $from = self::DEFAULT_FROM,
        public readonly string $fromName = self::DEFAULT_FROM_NAME,
        public readonly ?string $replyTo = null,
        public readonly bool $smtp = true,
    ) {
    }

    /**
     * @param array<string, mixed> $env
     */
    public static function fromEnv(array $env): self
    {
        $encryption = strtolower(Config::string($env, 'MAIL_ENCRYPTION') ?? '');
        $port = Config::string($env, 'MAIL_PORT');
        // Not said: what the port says (587 is STARTTLS; the rest is SMTPS)
        $secure = match ($encryption) {
            'tls', 'starttls' => 'tls',
            'none', 'null', 'false' => '',
            'ssl' => 'ssl',
            default => $port === '587' ? 'tls' : 'ssl',
        };

        return new self(
            Config::string($env, 'MAIL_HOST'),
            $port !== null && ctype_digit($port) ? (int) $port : ($secure === 'tls' ? 587 : 465),
            $secure,
            Config::string($env, 'MAIL_USERNAME'),
            Config::string($env, 'MAIL_PASSWORD'),
            Config::string($env, 'MAIL_FROM_ADDRESS') ?? self::DEFAULT_FROM,
            Config::string($env, 'MAIL_FROM_NAME') ?? self::DEFAULT_FROM_NAME,
            Config::string($env, 'MAIL_REPLY_TO'),
            strtolower(Config::string($env, 'MAIL_DRIVER') ?? 'smtp') === 'smtp',
        );
    }

    public function canSend(): bool
    {
        return $this->smtp && $this->host !== null;
    }
}
