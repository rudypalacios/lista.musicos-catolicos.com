<?php

declare(strict_types=1);

namespace Tests\Security;

use App\Security\ProofOfWork;
use App\Security\Secrets;
use PDO;
use PHPUnit\Framework\TestCase;
use Tests\Support\TestDatabase;

final class ProofOfWorkTest extends TestCase
{
    private PDO $pdo;
    private ProofOfWork $proof;

    protected function setUp(): void
    {
        $this->pdo = TestDatabase::migrated();
        $this->proof = new ProofOfWork($this->pdo, new Secrets($this->pdo));
    }

    /** What the browser does: tries numbers until the hash starts with enough zero bits */
    public static function solve(string $challenge): string
    {
        for ($nonce = 0;; $nonce++) {
            if (ProofOfWork::hasZeroBits(hash('sha256', $challenge . ':' . $nonce, true), ProofOfWork::BITS)) {
                return (string) $nonce;
            }
        }
    }

    public function testASolvedChallengeIsAcceptedOnce(): void
    {
        $issued = $this->proof->issue(1_000);
        $nonce = self::solve($issued['challenge']);

        $this->assertSame(ProofOfWork::BITS, $issued['bits']);
        $this->assertTrue($this->proof->accept($issued['challenge'], $nonce, 2_000));
        $again = $this->proof->accept($issued['challenge'], $nonce, 2_000);
        $this->assertFalse($again, 'a spent challenge opens nothing more');
    }

    public function testAWrongAnswerIsRefusedAndDoesNotSpendTheChallenge(): void
    {
        $issued = $this->proof->issue(1_000);
        $good = self::solve($issued['challenge']);
        $wrong = (string) ((int) $good + 1);
        while (ProofOfWork::hasZeroBits(hash('sha256', $issued['challenge'] . ':' . $wrong, true), ProofOfWork::BITS)) {
            $wrong = (string) ((int) $wrong + 1);
        }

        $this->assertFalse($this->proof->accept($issued['challenge'], $wrong, 2_000));
        $this->assertTrue($this->proof->accept($issued['challenge'], $good, 2_000));
    }

    public function testAnExpiredChallengeIsRefused(): void
    {
        $issued = $this->proof->issue(1_000);
        $nonce = self::solve($issued['challenge']);

        $this->assertFalse($this->proof->accept($issued['challenge'], $nonce, $issued['expiresAt']));
    }

    public function testAChallengeThatIsNotOursIsRefused(): void
    {
        $issued = $this->proof->issue(1_000);
        [$random, $expires, $signature] = explode('.', $issued['challenge']);
        // A later expiry with the old signature, and a signature that is not the one the app would make
        $forged = $random . '.' . ((int) $expires + 999_999) . '.' . $signature;
        $foreign = $random . '.' . $expires . '.' . str_repeat('0', 32);

        foreach ([$forged, $foreign, 'nonsense', '', 'a.b.c'] as $challenge) {
            $this->assertFalse($this->proof->accept($challenge, self::solve($challenge), 2_000), $challenge);
        }
    }

    public function testTheNonceIsOnlyDigits(): void
    {
        $issued = $this->proof->issue(1_000);

        foreach (['', 'abc', '-1', str_repeat('9', 30), '1 '] as $nonce) {
            $this->assertFalse($this->proof->accept($issued['challenge'], $nonce, 2_000), $nonce);
        }
    }

    public function testCountsTheLeadingZeroBitsOfADigest(): void
    {
        $this->assertTrue(ProofOfWork::hasZeroBits("\x00\x00\xff", 16));
        $this->assertFalse(ProofOfWork::hasZeroBits("\x00\x01\xff", 16));
        $this->assertTrue(ProofOfWork::hasZeroBits("\x00\x1f", 11), '11 bits: a zero byte and three zero bits');
        $this->assertFalse(ProofOfWork::hasZeroBits("\x00\x20", 11));
        $this->assertTrue(ProofOfWork::hasZeroBits("\xff", 0));
    }

    public function testTheSecretIsMadeOnceAndKept(): void
    {
        $secrets = new Secrets($this->pdo);

        $first = $secrets->get('pow');

        $this->assertMatchesRegularExpression('~^[0-9a-f]{64}$~', $first);
        $this->assertSame($first, (new Secrets($this->pdo))->get('pow'));
        $this->assertNotSame($first, $secrets->get('other'));
    }
}
