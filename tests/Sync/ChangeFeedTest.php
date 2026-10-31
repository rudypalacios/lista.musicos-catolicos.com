<?php

declare(strict_types=1);

namespace Tests\Sync;

use App\Sync\ChangeFeed;
use App\Sync\SetlistChange;
use App\Sync\SetlistRepository;
use App\Sync\SongChange;
use App\Sync\SongRepository;
use App\Sync\TemplateChange;
use App\Sync\TemplateRepository;
use PHPUnit\Framework\TestCase;
use Tests\Support\TestDatabase;

final class ChangeFeedTest extends TestCase
{
    private const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    private SongRepository $songs;
    private SetlistRepository $setlists;
    private TemplateRepository $templates;
    private ChangeFeed $feed;

    protected function setUp(): void
    {
        $pdo = TestDatabase::migrated();
        $this->songs = new SongRepository($pdo);
        $this->setlists = new SetlistRepository($pdo);
        $this->templates = new TemplateRepository($pdo);
        $this->feed = new ChangeFeed($this->songs, $this->setlists, $this->templates);
    }

    private function id(string $kind, int $n): string
    {
        return sprintf('%s0000000-0000-4000-8000-%012d', $kind, $n);
    }

    private function song(int $n): void
    {
        $this->songs->apply(self::ME, new SongChange($this->id('a', $n), "Canto $n", '', '[G]x', 1000 + $n, false));
    }

    private function setlist(int $n): void
    {
        $change = new SetlistChange($this->id('b', $n), "Misa $n", null, '', [], 1000 + $n, false);
        $this->setlists->apply(self::ME, $change);
    }

    public function testItIsEmptyBeforeAnyChange(): void
    {
        $page = $this->feed->page(self::ME, 0, 10);

        $this->assertSame([], $page['songs']);
        $this->assertSame([], $page['setlists']);
        $this->assertSame([], $page['templates']);
        $this->assertSame(0, $page['cursor']);
        $this->assertFalse($page['hasMore']);
    }

    public function testSongsAndSetlistsShareOneCursor(): void
    {
        $this->song(1);
        $this->setlist(1);
        $this->song(2);

        $page = $this->feed->page(self::ME, 0, 10);

        $this->assertSame(['Canto 1', 'Canto 2'], array_column($page['songs'], 'title'));
        $this->assertSame(['Misa 1'], array_column($page['setlists'], 'title'));
        $this->assertSame(3, $page['cursor']);
        $this->assertFalse($page['hasMore']);
    }

    public function testTemplatesShareTheSameCursor(): void
    {
        $this->song(1);
        $this->templates->apply(
            self::ME,
            new TemplateChange($this->id('c', 1), 'Rosario', [['id' => 'p-uno', 'name' => 'Misterios']], 2000, false)
        );
        $this->setlist(1);

        $page = $this->feed->page(self::ME, 0, 10);

        $this->assertSame(['Rosario'], array_column($page['templates'], 'name'));
        $this->assertSame(3, $page['cursor']);
        $this->assertSame([], $this->feed->page(self::ME, 3, 10)['templates']);
    }

    public function testAPageIsCutByChangeNumberWhicheverTableHoldsTheChanges(): void
    {
        // Numbers 1..7: s s l l s l l
        $this->song(1);
        $this->song(2);
        $this->setlist(1);
        $this->setlist(2);
        $this->song(3);
        $this->setlist(3);
        $this->setlist(4);

        $first = $this->feed->page(self::ME, 0, 3);

        $this->assertSame(['Canto 1', 'Canto 2'], array_column($first['songs'], 'title'));
        $this->assertSame(['Misa 1'], array_column($first['setlists'], 'title'));
        $this->assertSame(3, $first['cursor']);
        $this->assertTrue($first['hasMore']);

        $second = $this->feed->page(self::ME, $first['cursor'], 3);

        $this->assertSame(['Canto 3'], array_column($second['songs'], 'title'));
        $this->assertSame(['Misa 2', 'Misa 3'], array_column($second['setlists'], 'title'));
        $this->assertSame(6, $second['cursor']);
        $this->assertTrue($second['hasMore']);

        $third = $this->feed->page(self::ME, $second['cursor'], 3);

        $this->assertSame(['Misa 4'], array_column($third['setlists'], 'title'));
        $this->assertSame(7, $third['cursor']);
        $this->assertFalse($third['hasMore']);
    }

    public function testPagingNeverSkipsOrRepeatsAChange(): void
    {
        for ($n = 1; $n <= 9; $n++) {
            $n % 3 === 0 ? $this->setlist($n) : $this->song($n);
        }

        $titles = [];
        $cursor = 0;
        do {
            $page = $this->feed->page(self::ME, $cursor, 2);
            $titles = [
                ...$titles,
                ...array_column($page['songs'], 'title'),
                ...array_column($page['setlists'], 'title'),
            ];
            $cursor = $page['cursor'];
        } while ($page['hasMore']);

        sort($titles);
        $this->assertCount(9, $titles);
        $this->assertSame($titles, array_unique($titles));
    }

    public function testTheCursorStaysWhereItWasWhenNothingIsNew(): void
    {
        $this->song(1);

        $page = $this->feed->page(self::ME, 1, 10);

        $this->assertSame(1, $page['cursor']);
        $this->assertSame([], $page['songs']);
    }
}
