<?php

declare(strict_types=1);

namespace App\Auth\Google;

use App\Auth\Accounts;
use App\Auth\InvalidAccount;

/** Who Google says the person is: its stable id for them and the address of their account */
final class GoogleIdentity
{
    /** What the `identities` table can hold */
    public const SUBJECT_MAX = 100;

    private const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

    public function __construct(public readonly string $subject, public readonly string $email)
    {
    }

    /**
     * Reads the claims of the ID token Google sent in answer to our code, checking what the sign-in depends on: it was issued
     * by Google, for this client, it has not expired, it answers the request we made (nonce), and the address is confirmed.
     *
     * The token's signature is not checked: it came straight from Google's token endpoint over TLS in answer to a request
     * carrying our secret, which is what OpenID Connect Core (3.1.3.7) accepts in place of it.
     *
     * @param array<string, mixed> $claims
     *
     * @throws GoogleFailed
     */
    public static function fromClaims(array $claims, string $clientId, string $nonce, int $nowSeconds): self
    {
        $issuer = $claims['iss'] ?? null;
        if (!is_string($issuer) || !in_array($issuer, self::ISSUERS, true)) {
            throw new GoogleFailed('The token was not issued by Google');
        }
        $audience = $claims['aud'] ?? null;
        if ($audience !== $clientId) {
            throw new GoogleFailed('The token is for another client');
        }
        $expires = $claims['exp'] ?? null;
        if (!is_int($expires) || $expires <= $nowSeconds) {
            throw new GoogleFailed('The token has expired');
        }
        $sent = $claims['nonce'] ?? null;
        if (!is_string($sent) || !hash_equals($nonce, $sent)) {
            throw new GoogleFailed('The token does not answer this request');
        }
        $subject = $claims['sub'] ?? null;
        if (!is_string($subject) || $subject === '' || strlen($subject) > self::SUBJECT_MAX) {
            throw new GoogleFailed('The token has no usable subject');
        }
        $email = $claims['email'] ?? null;
        if (!is_string($email)) {
            throw new GoogleFailed('The token has no address');
        }
        if (($claims['email_verified'] ?? null) !== true) {
            throw new GoogleFailed('Google has not confirmed the address', GoogleFailed::UNVERIFIED);
        }
        try {
            $clean = Accounts::cleanEmail($email);
        } catch (InvalidAccount) {
            throw new GoogleFailed('The address is not one the app accepts');
        }

        return new self($subject, $clean);
    }
}
