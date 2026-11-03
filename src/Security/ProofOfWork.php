<?php

declare(strict_types=1);

namespace App\Security;

use PDO;
use PDOException;

/**
  * A speed bump for what a robot would do a thousand times: signing up, asking for a reset email. The server hands
  * out a challenge; the browser has to find a number that, put after it, gives a SHA-256 that starts with a number
  * of zero bits. That is some hundreds of thousands of tries (a second or less in a browser worker), nothing for a
  * person and a cost for a script that wants thousands of accounts. It runs on the person's device and loads
  * nothing from another domain, so the site's policy of asking nothing from anyone else holds.
 *
 * It is not a captcha: it does not tell a person from a program, it prices the program. It works together with the
 * limits per address and with the email that has to be confirmed.
 *
 * A challenge is `random.expiresAtMs.signature`, signed with a secret of the app's, so the server keeps nothing about
 * the ones it hands out; the ones solved are kept until they expire so each opens one request only.
 */
final class ProofOfWork
{
    /** Zero bits the hash must start with: 2^18 = about 260 thousand tries on average */
    public const BITS = 18;
    /** How long a challenge can be solved and used */
    public const TTL_SECONDS = 600;

    public function __construct(private readonly PDO $pdo, private readonly Secrets $secrets)
    {
    }

    /**
     * A new challenge.
     *
     * @return array{challenge: string, bits: int, expiresAt: int}
     */
    public function issue(int $now): array
    {
        $expiresAt = $now + self::TTL_SECONDS * 1000;
        $body = bin2hex(random_bytes(12)) . '.' . $expiresAt;

        return ['challenge' => $body . '.' . $this->sign($body), 'bits' => self::BITS, 'expiresAt' => $expiresAt];
    }

    /**
     * Whether `nonce` solves `challenge`: the challenge is ours, has not expired, was not spent and the hash of the two
     * has the zero bits. A good answer spends the challenge.
     */
    public function accept(string $challenge, string $nonce, int $now): bool
    {
        $parts = explode('.', $challenge);
        $wellFormed = count($parts) === 3
            && preg_match('~^[0-9a-f]{24}$~', $parts[0]) === 1
            && preg_match('~^\d{1,15}$~', $parts[1]) === 1;
        if (!$wellFormed) {
            return false;
        }
        $body = $parts[0] . '.' . $parts[1];
        if (!hash_equals($this->sign($body), $parts[2]) || (int) $parts[1] <= $now) {
            return false;
        }
        // The nonce is whatever the browser tried: a number, as text; nothing longer than the work needs
        if (preg_match('~^\d{1,20}$~', $nonce) !== 1) {
            return false;
        }
        if (!self::hasZeroBits(hash('sha256', $challenge . ':' . $nonce, true), self::BITS)) {
            return false;
        }

        return $this->spend($challenge, (int) $parts[1], $now);
    }

    /** Whether the first `bits` bits of `$digest` are zero */
    public static function hasZeroBits(string $digest, int $bits): bool
    {
        $whole = intdiv($bits, 8);
        for ($i = 0; $i < $whole; $i++) {
            if (ord($digest[$i]) !== 0) {
                return false;
            }
        }
        $rest = $bits % 8;

        return $rest === 0 || (ord($digest[$whole]) >> (8 - $rest)) === 0;
    }

    private function sign(string $body): string
    {
        return substr(hash_hmac('sha256', $body, $this->secrets->get('pow')), 0, 32);
    }

    /** Remembers the challenge as spent; false when it already was */
    private function spend(string $challenge, int $expiresAt, int $now): bool
    {
        $this->pdo->prepare('DELETE FROM pow_spent WHERE expires_at <= ?')->execute([$now]);
        try {
            $this->pdo
                ->prepare('INSERT INTO pow_spent (challenge_hash, expires_at) VALUES (?, ?)')
                ->execute([hash('sha256', $challenge), $expiresAt]);
        } catch (PDOException) {
            return false;
        }

        return true;
    }
}
