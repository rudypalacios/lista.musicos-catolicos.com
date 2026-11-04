<?php

declare(strict_types=1);

namespace Tests\Security;

use App\Security\RateLimiter;
use PDO;
use PHPUnit\Framework\TestCase;
use Tests\Support\TestDatabase;

final class RateLimiterTest extends TestCase
{
    private const HOUR = 3600;

    private PDO $pdo;
    private RateLimiter $limits;

    protected function setUp(): void
    {
        $this->pdo = TestDatabase::migrated();
        $this->limits = new RateLimiter($this->pdo);
    }

    public function testSaysNoPastTheLimitWithinTheWindowAndYesAfterIt(): void
    {
        $now = 10_000_000;
        for ($i = 0; $i < 3; $i++) {
            $this->assertTrue($this->limits->allows('register', '1.1.1.1', 3, self::HOUR, $now));
            $this->limits->hit('register', '1.1.1.1', $now);
        }

        $this->assertFalse($this->limits->allows('register', '1.1.1.1', 3, self::HOUR, $now + 1_000));
        $this->assertTrue($this->limits->allows('register', '1.1.1.1', 3, self::HOUR, $now + self::HOUR * 1000 + 1));
    }

    public function testEachKindAndEachSubjectIsCountedApart(): void
    {
        $now = 10_000_000;
        $this->limits->hit('register', '1.1.1.1', $now);

        $this->assertFalse($this->limits->allows('register', '1.1.1.1', 1, self::HOUR, $now));
        $this->assertTrue($this->limits->allows('register', '2.2.2.2', 1, self::HOUR, $now));
        $this->assertTrue($this->limits->allows('forgot-ip', '1.1.1.1', 1, self::HOUR, $now));
    }

    public function testWhatIsOlderThanADayIsDeletedEvenForAddressesThatNeverComeBack(): void
    {
        $this->limits->hit('register', '9.9.9.9', 1_000);
        $this->limits->hit('forgot-email', str_repeat('a', 64), 1_000);
        $this->limits->hit('register', '1.1.1.1', 90_000_000);

        // Somebody else asks, a day and more later: the old ones are not kept for it
        $this->limits->allows('register', '1.1.1.1', 5, self::HOUR, 90_000_000 + 1);

        $left = $this->pdo->query('SELECT subject FROM rate_events')->fetchAll(PDO::FETCH_COLUMN);
        $this->assertSame(['1.1.1.1'], $left);
    }
}
