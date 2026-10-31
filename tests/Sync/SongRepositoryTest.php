<?php

declare(strict_types=1);

namespace Tests\Sync;

use App\Sync\Sequence;
use App\Sync\SongChange;
use App\Sync\SongRepository;
use PHPUnit\Framework\TestCase;
use Tests\Support\TestDatabase;

final class SongRepositoryTest extends TestCase
{
    private const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    private const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    private const SONG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    private SongRepository $songs;
    private Sequence $sequence;

    protected function setUp(): void
    {
        $pdo = TestDatabase::migrated();
        $this->songs = new SongRepository($pdo);
        $this->sequence = new Sequence($pdo);
    }

    /**
     * @param list<string>|null $tags
     */
    private function change(
        string $title,
        int $at,
        bool $deleted = false,
        string $id = self::SONG,
        ?int $myShift = null,
        ?array $tags = null
    ): SongChange {
        return new SongChange($id, $title, 'Autor', "[G]Letra de $title", $at, $deleted, $myShift, $tags);
    }

    public function testANewSongIsStoredAndNumbered(): void
    {
        $this->assertTrue($this->songs->apply(self::ME, $this->change('Uno', 1000)));

        $rows = $this->songs->changedSince(self::ME, 0, 10);
        $this->assertCount(1, $rows);
        $this->assertSame('Uno', $rows[0]['title']);
        $this->assertSame('[G]Letra de Uno', $rows[0]['body']);
        $this->assertSame(1000, $rows[0]['updatedAt']);
        $this->assertNull($rows[0]['deletedAt']);
        $this->assertSame(1, $rows[0]['seq']);
        $this->assertSame(1, $this->sequence->latest(self::ME));
    }

    public function testANewerEditReplacesAndGetsANewNumber(): void
    {
        $this->songs->apply(self::ME, $this->change('Uno', 1000));

        $this->assertTrue($this->songs->apply(self::ME, $this->change('Uno editado', 2000)));

        $rows = $this->songs->changedSince(self::ME, 0, 10);
        $this->assertCount(1, $rows);
        $this->assertSame('Uno editado', $rows[0]['title']);
        $this->assertSame(2, $rows[0]['seq']);
    }

    public function testMyKeyIsStoredAndReturned(): void
    {
        $this->songs->apply(self::ME, $this->change('Uno', 1000));
        $this->assertSame(0, $this->songs->changedSince(self::ME, 0, 10)[0]['myShift'], 'a song with none starts at 0');

        $this->songs->apply(self::ME, $this->change('Uno', 2000, false, self::SONG, 2));

        $this->assertSame(2, $this->songs->changedSince(self::ME, 0, 10)[0]['myShift']);
    }

    public function testAnOlderClientThatSendsNoKeyKeepsTheStoredOne(): void
    {
        $this->songs->apply(self::ME, $this->change('Uno', 1000, false, self::SONG, -3));

        $this->songs->apply(self::ME, $this->change('Uno editado', 2000));

        $row = $this->songs->changedSince(self::ME, 0, 10)[0];
        $this->assertSame('Uno editado', $row['title']);
        $this->assertSame(-3, $row['myShift']);
    }

    public function testTagsAreStoredReadBackAndReplaced(): void
    {
        $this->songs->apply(self::ME, $this->change('Uno', 1000));
        $none = $this->songs->changedSince(self::ME, 0, 10)[0]['tags'];
        $this->assertSame([], $none, 'a song with none reads as an empty list');

        $this->songs->apply(self::ME, $this->change('Uno', 2000, false, self::SONG, null, ['Entrada', 'Señor ñ']));
        $this->assertSame(['Entrada', 'Señor ñ'], $this->songs->changedSince(self::ME, 0, 10)[0]['tags']);

        $this->songs->apply(self::ME, $this->change('Uno', 3000, false, self::SONG, null, []));
        $cleared = $this->songs->changedSince(self::ME, 0, 10)[0]['tags'];
        $this->assertSame([], $cleared, 'sent empty: the tags are removed');
    }

    public function testAnOlderClientThatSendsNoTagsKeepsTheStoredOnes(): void
    {
        $this->songs->apply(self::ME, $this->change('Uno', 1000, false, self::SONG, null, ['Entrada']));

        $this->songs->apply(self::ME, $this->change('Uno editado', 2000));

        $row = $this->songs->changedSince(self::ME, 0, 10)[0];
        $this->assertSame('Uno editado', $row['title']);
        $this->assertSame(['Entrada'], $row['tags']);
    }

    public function testAKeyOfZeroClearsIt(): void
    {
        $this->songs->apply(self::ME, $this->change('Uno', 1000, false, self::SONG, 4));
        $this->songs->apply(self::ME, $this->change('Uno', 2000, false, self::SONG, 0));

        $this->assertSame(0, $this->songs->changedSince(self::ME, 0, 10)[0]['myShift']);
    }

    public function testAnOlderEditSyncedLateDoesNotOverwriteANewerOne(): void
    {
        $this->songs->apply(self::ME, $this->change('Desde el iPad', 5000));

        $this->assertFalse($this->songs->apply(self::ME, $this->change('Desde el teléfono, sin conexión', 3000)));

        $this->assertSame('Desde el iPad', $this->songs->changedSince(self::ME, 0, 10)[0]['title']);
        $this->assertSame(1, $this->sequence->latest(self::ME), 'an ignored change takes no number');
    }

    public function testTheSameEditSentTwiceIsAppliedOnce(): void
    {
        $this->assertTrue($this->songs->apply(self::ME, $this->change('Uno', 1000)));
        $this->assertFalse($this->songs->apply(self::ME, $this->change('Uno', 1000)));

        $this->assertSame(1, $this->sequence->latest(self::ME));
    }

    public function testADeletionKeepsATombstoneWithoutTheLyrics(): void
    {
        $this->songs->apply(self::ME, $this->change('Uno', 1000));

        $this->assertTrue($this->songs->apply(self::ME, $this->change('Uno', 2000, true)));

        $row = $this->songs->changedSince(self::ME, 0, 10)[0];
        $this->assertSame(2000, $row['deletedAt']);
        $this->assertSame('', $row['body']);
    }

    public function testAnEditAfterADeletionBringsTheSongBack(): void
    {
        $this->songs->apply(self::ME, $this->change('Uno', 1000));
        $this->songs->apply(self::ME, $this->change('Uno', 2000, true));

        $this->songs->apply(self::ME, $this->change('Uno de nuevo', 3000));

        $row = $this->songs->changedSince(self::ME, 0, 10)[0];
        $this->assertNull($row['deletedAt']);
        $this->assertSame('Uno de nuevo', $row['title']);
    }

    public function testCharactersOfFourBytesSurvive(): void
    {
        $body = "[C]Gloria 𝄞 ♯ ♭ 🎵 ñandú — «sí»";

        $this->songs->apply(self::ME, new SongChange(self::SONG, 'Canto 🎶', 'Anónimo', $body, 1000, false));

        $row = $this->songs->changedSince(self::ME, 0, 10)[0];
        $this->assertSame($body, $row['body']);
        $this->assertSame('Canto 🎶', $row['title']);
    }

    public function testSomeoneElsesSongIsNeitherReadNorOverwritten(): void
    {
        $this->songs->apply(self::OTHER, $this->change('De otro', 1000));

        $this->assertFalse($this->songs->apply(self::ME, $this->change('Robado', 9000)));

        $this->assertSame([], $this->songs->changedSince(self::ME, 0, 10));
        $this->assertSame('De otro', $this->songs->changedSince(self::OTHER, 0, 10)[0]['title']);
    }

    public function testEachUserHasTheirOwnNumbering(): void
    {
        $this->songs->apply(self::ME, $this->change('Mío', 1000));
        $this->songs->apply(self::OTHER, $this->change('Suyo', 1000, false, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'));

        $this->assertSame(1, $this->sequence->latest(self::ME));
        $this->assertSame(1, $this->sequence->latest(self::OTHER));
    }

    public function testChangedSinceReturnsOnlyWhatIsNewInOrder(): void
    {
        foreach (['a', 'b', 'c'] as $i => $letter) {
            $id = str_repeat($letter, 8) . '-' . str_repeat($letter, 4) . '-4' . str_repeat($letter, 3)
                . '-8' . str_repeat($letter, 3) . '-' . str_repeat($letter, 12);
            $this->songs->apply(self::ME, $this->change("Canto $letter", 1000 + $i, false, $id));
        }

        $rows = $this->songs->changedSince(self::ME, 1, 10);

        $this->assertSame(['Canto b', 'Canto c'], array_column($rows, 'title'));
        $this->assertSame([2, 3], array_column($rows, 'seq'));
        $this->assertCount(1, $this->songs->changedSince(self::ME, 0, 1));
        $this->assertSame([], $this->songs->changedSince(self::ME, 3, 10));
    }
}
