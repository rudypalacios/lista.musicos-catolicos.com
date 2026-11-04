<?php

declare(strict_types=1);

namespace App;

/**
 * How the app sends email: the mailbox of the site (SMTP) it signs in to, and the address the messages come from.
 * With no host the app does not send: it writes the message to the error log instead (development, tests, and a
 * server whose .env does not have the mailbox yet), so a missing setting never takes the sign-up down.
 */
final class MailConfig
{
    public const DEFAULT_FROM = 'noreply@musicos-catolicos.com';

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
        public readonly string $fromName = 'Listas · Músicos Católicos',
    ) {
    }

    /**
     * @param array<string, mixed> $env
     */
    public static function fromEnv(array $env): self
    {
        $secure = Config::string($env, 'SMTP_SECURE') ?? 'ssl';
        $port = Config::string($env, 'SMTP_PORT');

        return new self(
            Config::string($env, 'SMTP_HOST'),
            $port !== null && ctype_digit($port) ? (int) $port : ($secure === 'tls' ? 587 : 465),
            $secure === 'tls' || $secure === 'none' ? ($secure === 'none' ? '' : 'tls') : 'ssl',
            Config::string($env, 'SMTP_USERNAME'),
            Config::string($env, 'SMTP_PASSWORD'),
            Config::string($env, 'MAIL_FROM') ?? self::DEFAULT_FROM,
        );
    }

    public function canSend(): bool
    {
        return $this->host !== null;
    }
}
