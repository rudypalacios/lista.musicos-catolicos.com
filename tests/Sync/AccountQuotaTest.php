<?php

declare(strict_types=1);

namespace Tests\Sync;

use App\Sync\AccountQuota;
use App\Sync\OverQuota;
use App\Sync\SetlistChange;
use App\Sync\SetlistRepository;
use App\Sync\SongChange;
use App\Sync\SongRepository;
use App\Sync\TemplateChange;
use App\Sync\TemplateRepository;
use PDO;
use PHPUnit\Framework\TestCase;
use Tests\Support\TestDatabase;

final class AccountQuotaTest extends TestCase
{
    private const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    private const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    private PDO $pdo;
    private SongRepository $songs;

    protected function setUp(): void
    {
        $this->pdo = TestDatabase::migrated();
        $this->songs = new SongRepository($this->pdo);
    }

    private static function id(int $n): string
    {
        return sprintf('cccccccc-cccc-4ccc-8ccc-%012d', $n);
    }

    private function song(int $n, string $body = 'letra', int $at = 1000, bool $deleted = false): SongChange
    {
        return new SongChange(self::id($n), "Canto $n", 'Autor', $body, $at, $deleted, null, []);
    }

    /** @param list<SongChange> $songs */
    private function room(AccountQuota $quota, array $songs, string $user = self::ME): void
    {
        $quota->assertRoom($user, $songs, [], []);
    }

    public function testAnAccountWithinItsLimitsKeepsWriting(): void
    {
        $quota = new AccountQuota($this->pdo, 100_000, 3, 3, 3);
        $this->songs->apply(self::ME, $this->song(1));
        $this->songs->apply(self::ME, $this->song(2));

        $this->room($quota, [$this->song(3)]);
        $this->addToAssertionCount(1);
    }

    public function testTheSongAfterTheLimitIsRefusedAndSaysWhich(): void
    {
        $quota = new AccountQuota($this->pdo, 100_000, 2, 3, 3);
        $this->songs->apply(self::ME, $this->song(1));
        $this->songs->apply(self::ME, $this->song(2));

        $this->expectException(OverQuota::class);
        $this->expectExceptionMessage('2 cantos');
        $this->room($quota, [$this->song(3)]);
    }

    public function testAnEditOrADeletionPassesAtTheLimit(): void
    {
        $quota = new AccountQuota($this->pdo, 100_000, 2, 3, 3);
        $this->songs->apply(self::ME, $this->song(1));
        $this->songs->apply(self::ME, $this->song(2));

        // Editing a song that exists, and deleting one, make the account hold no more than it did
        $this->room($quota, [$this->song(1, 'otra letra', 2000)]);
        $this->room($quota, [$this->song(2, '', 2000, true)]);
        // ...and once one is deleted there is room for a new one
        $this->songs->apply(self::ME, $this->song(2, '', 2000, true));
        $this->room($quota, [$this->song(3)]);
        $this->addToAssertionCount(3);
    }

    public function testTheSameChangeAgainDoesNotCountTwice(): void
    {
        $quota = new AccountQuota($this->pdo, 100_000, 1, 3, 3);
        $this->songs->apply(self::ME, $this->song(1));

        // The server ignores an equal stamp, so a retried batch must not be refused for it
        $this->room($quota, [$this->song(1)]);
        $this->addToAssertionCount(1);
    }

    public function testSpaceIsALimitOfItsOwn(): void
    {
        $quota = new AccountQuota($this->pdo, 5_000, 100, 100, 100);
        $this->songs->apply(self::ME, $this->song(1, str_repeat('a', 3000)));

        $this->expectException(OverQuota::class);
        $this->expectExceptionMessage('límite de espacio');
        $this->room($quota, [$this->song(2, str_repeat('b', 3000))]);
    }

    public function testAnAccountOverTheSpaceCanStillShrink(): void
    {
        $this->songs->apply(self::ME, $this->song(1, str_repeat('a', 4000)));
        $quota = new AccountQuota($this->pdo, 1_000, 100, 100, 100);

        $this->room($quota, [$this->song(1, 'corta', 2000)]);
        $this->addToAssertionCount(1);
    }

    public function testASentBatchIsCheckedTogether(): void
    {
        $quota = new AccountQuota($this->pdo, 100_000, 2, 3, 3);

        $this->expectException(OverQuota::class);
        $this->room($quota, [$this->song(1), $this->song(2), $this->song(3)]);
    }

    public function testListsAndTemplatesHaveTheirOwnCounts(): void
    {
        $quota = new AccountQuota($this->pdo, 100_000, 5, 1, 1);
        $firstList = new SetlistChange(self::id(10), 'Misa', null, '', [], 1000, false);
        (new SetlistRepository($this->pdo))->apply(self::ME, $firstList);
        $firstTemplate = new TemplateChange(self::id(20), 'Misa', [], 1000, false);
        (new TemplateRepository($this->pdo))->apply(self::ME, $firstTemplate);

        try {
            $second = new SetlistChange(self::id(11), 'Otra', null, '', [], 1000, false);
            $quota->assertRoom(self::ME, [], [$second], []);
            $this->fail('A second list must not fit');
        } catch (OverQuota $e) {
            $this->assertStringContainsString('1 listados', $e->getMessage());
        }
        try {
            $second = new TemplateChange(self::id(21), 'Otra', [], 1000, false);
            $quota->assertRoom(self::ME, [], [], [$second]);
            $this->fail('A second template must not fit');
        } catch (OverQuota $e) {
            $this->assertStringContainsString('1 plantillas', $e->getMessage());
        }
    }

    public function testAnotherAccountsRecordsDoNotCount(): void
    {
        $quota = new AccountQuota($this->pdo, 100_000, 1, 3, 3);
        $this->songs->apply(self::OTHER, $this->song(1));
        $this->songs->apply(self::OTHER, $this->song(2));

        $this->room($quota, [$this->song(1)]);
        $this->addToAssertionCount(1);
    }

    public function testTheDefaultLimitsAreWhatTheOwnersTextSays(): void
    {
        // web/src/views/privacy.ts and DEPLOY.md quote these numbers
        $this->assertSame(5_000_000, AccountQuota::MAX_BYTES);
        $this->assertSame(2000, AccountQuota::MAX_SONGS);
        $this->assertSame(1000, AccountQuota::MAX_SETLISTS);
        $this->assertSame(50, AccountQuota::MAX_TEMPLATES);
    }
}
