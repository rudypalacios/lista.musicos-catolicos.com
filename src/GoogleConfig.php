<?php

declare(strict_types=1);

namespace App;

/**
 * What the app needs to sign people in with Google: the id and the secret of the OAuth client the owner makes in Google Cloud
 * (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET in the server's .env, never in the repository). With either missing the
 * button is not offered, so the app works the same as before.
 *
 * The two addresses are Google's own; GOOGLE_AUTH_URL and GOOGLE_TOKEN_URL exist so the browser tests can put a stand-in
 * for Google in their place, and are not set on a real server.
 */
final class GoogleConfig
{
    public const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
    public const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    public function __construct(
        public readonly ?string $clientId = null,
        public readonly ?string $clientSecret = null,
        public readonly string $authUrl = self::AUTH_URL,
        public readonly string $tokenUrl = self::TOKEN_URL,
    ) {
    }

    /**
     * @param array<string, mixed> $env
     */
    public static function fromEnv(array $env): self
    {
        return new self(
            Config::string($env, 'GOOGLE_CLIENT_ID'),
            Config::string($env, 'GOOGLE_CLIENT_SECRET'),
            Config::string($env, 'GOOGLE_AUTH_URL') ?? self::AUTH_URL,
            Config::string($env, 'GOOGLE_TOKEN_URL') ?? self::TOKEN_URL,
        );
    }

    public function isConfigured(): bool
    {
        return $this->clientId !== null && $this->clientSecret !== null;
    }
}
