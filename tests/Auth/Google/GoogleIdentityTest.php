<?php

declare(strict_types=1);

namespace Tests\Auth\Google;

use App\Auth\Google\GoogleFailed;
use App\Auth\Google\GoogleIdentity;
use PHPUnit\Framework\TestCase;

final class GoogleIdentityTest extends TestCase
{
    private const CLIENT = 'client-id.apps.googleusercontent.com';
    private const NONCE = 'abc123';
    private const NOW = 1_800_000_000;

    /**
     * @param array<string, mixed> $changes
     *
     * @return array<string, mixed>
     */
    private function claims(array $changes = []): array
    {
        return $changes + [
            'iss' => 'https://accounts.google.com',
            'aud' => self::CLIENT,
            'exp' => self::NOW + 3600,
            'nonce' => self::NONCE,
            'sub' => '110248495921238986420',
            'email' => '  Ana.Perez@Gmail.com ',
            'email_verified' => true,
        ];
    }

    /** @param array<string, mixed> $claims */
    private function read(array $claims): GoogleIdentity
    {
        return GoogleIdentity::fromClaims($claims, self::CLIENT, self::NONCE, self::NOW);
    }

    public function testReadsTheSubjectAndTheCleanedAddress(): void
    {
        $who = $this->read($this->claims());

        $this->assertSame('110248495921238986420', $who->subject);
        $this->assertSame('ana.perez@gmail.com', $who->email);
    }

    public function testBothIssuersGoogleUsesAreAccepted(): void
    {
        $this->assertSame('x', $this->read($this->claims(['iss' => 'accounts.google.com', 'sub' => 'x']))->subject);
    }

    /** @return iterable<string, array{0: array<string, mixed>, 1: string}> */
    public static function refusals(): iterable
    {
        yield 'another issuer' => [['iss' => 'https://evil.example'], GoogleFailed::FAILED];
        yield 'another client' => [['aud' => 'someone-else'], GoogleFailed::FAILED];
        yield 'expired' => [['exp' => self::NOW], GoogleFailed::FAILED];
        yield 'expiry that is not a number' => [['exp' => '9999999999'], GoogleFailed::FAILED];
        yield 'another nonce' => [['nonce' => 'other'], GoogleFailed::FAILED];
        yield 'no nonce' => [['nonce' => null], GoogleFailed::FAILED];
        yield 'no subject' => [['sub' => ''], GoogleFailed::FAILED];
        yield 'a subject too long for the table' => [['sub' => str_repeat('1', 101)], GoogleFailed::FAILED];
        yield 'no address' => [['email' => null], GoogleFailed::FAILED];
        yield 'not an address' => [['email' => 'not an address'], GoogleFailed::FAILED];
        yield 'address not confirmed' => [['email_verified' => false], GoogleFailed::UNVERIFIED];
        yield 'confirmed as a word, not as true' => [['email_verified' => 'true'], GoogleFailed::UNVERIFIED];
        yield 'confirmation missing' => [['email_verified' => null], GoogleFailed::UNVERIFIED];
    }

    /**
     * @param array<string, mixed> $changes
     *
     * @dataProvider refusals
     */
    public function testRefusesWhatCannotBeTrusted(array $changes, string $reason): void
    {
        try {
            $this->read($this->claims($changes));
            $this->fail('It should have been refused');
        } catch (GoogleFailed $e) {
            $this->assertSame($reason, $e->reason);
        }
    }
}
