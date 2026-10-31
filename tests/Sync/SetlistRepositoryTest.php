<?php

declare(strict_types=1);

namespace Tests\Sync;

use App\Sync\Sequence;
use App\Sync\SetlistChange;
use App\Sync\SetlistRepository;
use PHPUnit\Framework\TestCase;
use Tests\Support\TestDatabase;

final class SetlistRepositoryTest extends TestCase
{
    private const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    private const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    private const LIST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    private const SONG = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    private SetlistRepository $setlists;
    private Sequence $sequence;

    protected function setUp(): void
    {
        $pdo = TestDatabase::migrated();
        $this->setlists = new SetlistRepository($pdo);
        $this->sequence = new Sequence($pdo);
    }

    /**
     * @param list<array{id: string, part: string, songId: string, transpose: int, note: string}>|null $items
     */
    private function change(
        string $title,
        int $at,
        bool $deleted = false,
        string $id = self::LIST,
        ?array $items = null,
    ): SetlistChange {
        $items ??= [['id' => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'part' => 'entrada', 'songId' => self::SONG,
            'transpose' => 3, 'note' => 'Dos veces']];

        $items = $deleted ? [] : $items;

        return new SetlistChange($id, $title, '2026-11-01', 'Notas de ' . $title, $items, $at, $deleted);
    }

    public function testANewSetlistIsStoredAndNumberedWithItsItems(): void
    {
        $this->assertTrue($this->setlists->apply(self::ME, $this->change('Domingo', 1000)));

        $rows = $this->setlists->changedSince(self::ME, 0, 10);
        $this->assertCount(1, $rows);
        $this->assertSame('Domingo', $rows[0]['title']);
        $this->assertSame('2026-11-01', $rows[0]['eventDate']);
        $this->assertSame('Notas de Domingo', $rows[0]['notes']);
        $this->assertSame(3, $rows[0]['items'][0]['transpose']);
        $this->assertSame('entrada', $rows[0]['items'][0]['part']);
        $this->assertSame(1000, $rows[0]['updatedAt']);
        $this->assertNull($rows[0]['deletedAt']);
        $this->assertSame(1, $rows[0]['seq']);
    }

    public function testThePartsOfAListAreStoredAndReadBack(): void
    {
        $parts = [
            ['id' => 'entrada', 'name' => 'Canto de entrada'],
            ['id' => 'p-ab12cd34', 'name' => 'Misterio ñ', 'off' => true],
        ];
        $this->setlists->apply(
            self::ME,
            new SetlistChange(self::LIST, 'Rosario', null, '', [], 1000, false, null, $parts)
        );

        $this->assertSame($parts, $this->setlists->changedSince(self::ME, 0, 10)[0]['parts']);

        $newer = [['id' => 'cantos', 'name' => 'Cantos']];
        $this->setlists->apply(
            self::ME,
            new SetlistChange(self::LIST, 'Rosario', null, '', [], 2000, false, null, $newer)
        );

        $this->assertSame($newer, $this->setlists->changedSince(self::ME, 0, 10)[0]['parts']);
    }

    public function testASetlistWithoutDateKeepsNoDate(): void
    {
        $this->setlists->apply(self::ME, new SetlistChange(self::LIST, 'Sin fecha', null, '', [], 1000, false));

        $this->assertNull($this->setlists->changedSince(self::ME, 0, 10)[0]['eventDate']);
    }

    private function starred(?bool $starred, int $at): SetlistChange
    {
        return new SetlistChange(self::LIST, 'Rosario', null, '', [], $at, false, $starred);
    }

    public function testAListStartsUnstarredAndTheStarSyncsWithTheEdit(): void
    {
        $this->setlists->apply(self::ME, $this->starred(null, 1000));
        $this->assertFalse($this->setlists->changedSince(self::ME, 0, 10)[0]['starred']);

        $this->setlists->apply(self::ME, $this->starred(true, 2000));
        $row = $this->setlists->changedSince(self::ME, 0, 10)[0];
        $this->assertTrue($row['starred']);
        $this->assertSame(2, $row['seq'], 'a star is a change like any other: other devices pull it');

        $this->setlists->apply(self::ME, $this->starred(false, 3000));
        $this->assertFalse($this->setlists->changedSince(self::ME, 0, 10)[0]['starred']);
    }

    public function testAnEditFromAnOlderAppKeepsTheStoredStar(): void
    {
        $this->setlists->apply(self::ME, $this->starred(true, 1000));

        $this->setlists->apply(self::ME, $this->starred(null, 2000));

        $this->assertTrue($this->setlists->changedSince(self::ME, 0, 10)[0]['starred']);
    }

    public function testDeletingAStarredListClearsTheStar(): void
    {
        $this->setlists->apply(self::ME, $this->starred(true, 1000));

        $this->setlists->apply(self::ME, new SetlistChange(self::LIST, 'Rosario', null, '', [], 2000, true, false));

        $this->assertFalse($this->setlists->changedSince(self::ME, 0, 10)[0]['starred']);
    }

    public function testANewerEditReplacesTheWholeListAndGetsANewNumber(): void
    {
        $this->setlists->apply(self::ME, $this->change('Domingo', 1000));

        $edit = $this->change('Domingo, editado', 2000, false, self::LIST, []);
        $this->assertTrue($this->setlists->apply(self::ME, $edit));

        $rows = $this->setlists->changedSince(self::ME, 0, 10);
        $this->assertCount(1, $rows);
        $this->assertSame('Domingo, editado', $rows[0]['title']);
        $this->assertSame([], $rows[0]['items']);
        $this->assertSame(2, $rows[0]['seq']);
    }

    public function testAnOlderEditSyncedLateDoesNotOverwriteANewerOne(): void
    {
        $this->setlists->apply(self::ME, $this->change('Desde el iPad', 5000));

        $this->assertFalse($this->setlists->apply(self::ME, $this->change('Desde el teléfono', 3000)));

        $this->assertSame('Desde el iPad', $this->setlists->changedSince(self::ME, 0, 10)[0]['title']);
        $this->assertSame(1, $this->sequence->latest(self::ME), 'an ignored change takes no number');
    }

    public function testTheSameEditSentTwiceIsAppliedOnce(): void
    {
        $this->assertTrue($this->setlists->apply(self::ME, $this->change('Domingo', 1000)));
        $this->assertFalse($this->setlists->apply(self::ME, $this->change('Domingo', 1000)));

        $this->assertSame(1, $this->sequence->latest(self::ME));
    }

    public function testADeletionKeepsATombstoneWithoutItemsOrNotes(): void
    {
        $this->setlists->apply(self::ME, $this->change('Domingo', 1000));

        $this->assertTrue($this->setlists->apply(self::ME, $this->change('Domingo', 2000, true)));

        $row = $this->setlists->changedSince(self::ME, 0, 10)[0];
        $this->assertSame(2000, $row['deletedAt']);
        $this->assertSame([], $row['items']);
    }

    public function testAnEditAfterADeletionBringsTheListBack(): void
    {
        $this->setlists->apply(self::ME, $this->change('Domingo', 1000));
        $this->setlists->apply(self::ME, $this->change('Domingo', 2000, true));

        $this->setlists->apply(self::ME, $this->change('Domingo de nuevo', 3000));

        $row = $this->setlists->changedSince(self::ME, 0, 10)[0];
        $this->assertNull($row['deletedAt']);
        $this->assertSame('Domingo de nuevo', $row['title']);
        $this->assertCount(1, $row['items']);
    }

    public function testCharactersOfFourBytesSurviveInEveryTextColumn(): void
    {
        $items = [['id' => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'part' => 'comunion', 'songId' => self::SONG,
            'transpose' => 0, 'note' => 'Con 🎻 y «guitarra» ♯']];

        $this->setlists->apply(
            self::ME,
            new SetlistChange(self::LIST, 'Misa 🎶 ñandú', '2026-11-01', 'Notas 𝄞 ♭', $items, 1000, false)
        );

        $row = $this->setlists->changedSince(self::ME, 0, 10)[0];
        $this->assertSame('Misa 🎶 ñandú', $row['title']);
        $this->assertSame('Notas 𝄞 ♭', $row['notes']);
        $this->assertSame('Con 🎻 y «guitarra» ♯', $row['items'][0]['note']);
    }

    public function testSomeoneElsesSetlistIsNeitherReadNorOverwritten(): void
    {
        $this->setlists->apply(self::OTHER, $this->change('De otro', 1000));

        $this->assertFalse($this->setlists->apply(self::ME, $this->change('Robado', 9000)));

        $this->assertSame([], $this->setlists->changedSince(self::ME, 0, 10));
        $this->assertSame('De otro', $this->setlists->changedSince(self::OTHER, 0, 10)[0]['title']);
    }

    public function testChangedSinceReturnsOnlyWhatIsNewInOrder(): void
    {
        foreach (['a', 'b', 'c'] as $i => $letter) {
            $id = str_repeat($letter, 8) . '-' . str_repeat($letter, 4) . '-4' . str_repeat($letter, 3)
                . '-8' . str_repeat($letter, 3) . '-' . str_repeat($letter, 12);
            $this->setlists->apply(self::ME, $this->change("Misa $letter", 1000 + $i, false, $id));
        }

        $rows = $this->setlists->changedSince(self::ME, 1, 10);

        $this->assertSame(['Misa b', 'Misa c'], array_column($rows, 'title'));
        $this->assertSame([2, 3], array_column($rows, 'seq'));
        $this->assertCount(1, $this->setlists->changedSince(self::ME, 0, 1));
    }
}
