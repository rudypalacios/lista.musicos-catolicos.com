<?php

declare(strict_types=1);

namespace Tests\Sync;

use App\Sync\InvalidSong;
use App\Sync\SongChange;
use PHPUnit\Framework\TestCase;

final class SongChangeTest extends TestCase
{
    private const ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    private const NOW = 1_800_000_000_000;

    /**
     * @param array<string, mixed> $override
     *
     * @return array<string, mixed>
     */
    private function data(array $override = []): array
    {
        return $override + [
            'id' => self::ID, 'title' => 'Caminamos con alegría', 'author' => 'Anónimo',
            'body' => '[C]Caminamos', 'updatedAt' => self::NOW - 1000, 'deleted' => false,
        ];
    }

    public function testAValidSongIsRead(): void
    {
        $change = SongChange::fromArray($this->data(), self::NOW);

        $this->assertSame('Caminamos con alegría', $change->title);
        $this->assertSame(self::NOW - 1000, $change->updatedAt);
        $this->assertFalse($change->deleted);
    }

    public function testTitleAndAuthorAreTrimmedAndTheAuthorIsOptional(): void
    {
        $change = SongChange::fromArray($this->data(['title' => '  Hola  ', 'author' => null]), self::NOW);

        $this->assertSame('Hola', $change->title);
        $this->assertSame('', $change->author);
    }

    /**
     * @return array<string, array{array<string, mixed>, string}>
     */
    public static function invalid(): array
    {
        return [
            'no id' => [['id' => null], 'identificador'],
            'bad id' => [['id' => 'not-a-uuid'], 'identificador'],
            'sql in the id' => [['id' => "x' OR '1'='1"], 'identificador'],
            'empty title' => [['title' => '   '], 'título'],
            'title not text' => [['title' => ['x']], 'título'],
            'long title' => [['title' => str_repeat('a', 191)], 'largo'],
            'long author' => [['author' => str_repeat('a', 191)], 'largo'],
            'body not text' => [['body' => 42], 'letra'],
            'huge body' => [['body' => str_repeat('a', 60001)], 'letra'],
            'no date' => [['updatedAt' => null], 'fecha'],
            'date as text' => [['updatedAt' => '1700000000000'], 'fecha'],
            'negative date' => [['updatedAt' => -1], 'fecha'],
        ];
    }

    /**
     * @dataProvider invalid
     *
     * @param array<string, mixed> $override
     */
    public function testInvalidSongsAreRefusedWithASpanishMessage(array $override, string $mentions): void
    {
        $this->expectException(InvalidSong::class);
        $this->expectExceptionMessageMatches('~' . $mentions . '~u');

        SongChange::fromArray($this->data($override), self::NOW);
    }

    public function testAMultibyteTitleIsMeasuredInCharactersNotBytes(): void
    {
        $change = SongChange::fromArray($this->data(['title' => str_repeat('ñ', 190)]), self::NOW);

        $this->assertSame(190, mb_strlen($change->title));
    }

    public function testAClockInTheFarFutureIsPulledBack(): void
    {
        $change = SongChange::fromArray($this->data(['updatedAt' => self::NOW + 86_400_000]), self::NOW);

        $this->assertSame(self::NOW + SongChange::MAX_FUTURE_MS, $change->updatedAt);
    }

    public function testADeletionNeedsNoTitle(): void
    {
        $change = SongChange::fromArray($this->data(['title' => '', 'deleted' => true]), self::NOW);

        $this->assertTrue($change->deleted);
    }
}
