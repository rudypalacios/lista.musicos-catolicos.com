<?php

declare(strict_types=1);

namespace Tests\Sync;

use App\Sync\InvalidSetlist;
use App\Sync\SetlistChange;
use PHPUnit\Framework\TestCase;

final class SetlistChangeTest extends TestCase
{
    private const ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    private const SONG = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    private const NOW = 1_800_000_000_000;

    /**
     * @param array<string, mixed> $override
     *
     * @return array<string, mixed>
     */
    private function item(array $override = []): array
    {
        return $override + [
            'id' => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'part' => 'entrada', 'songId' => self::SONG,
            'transpose' => 2, 'note' => 'Sin el último coro',
        ];
    }

    private function itemId(int $n): string
    {
        return sprintf('eeeeeeee-eeee-4eee-8eee-%012d', $n);
    }

    /**
     * @param array<string, mixed> $override
     *
     * @return array<string, mixed>
     */
    private function data(array $override = []): array
    {
        return $override + [
            'id' => self::ID, 'title' => 'Misa del domingo', 'eventDate' => '2026-11-01', 'notes' => '',
            'items' => [$this->item()], 'updatedAt' => self::NOW - 1000, 'deleted' => false,
        ];
    }

    public function testAValidSetlistIsRead(): void
    {
        $change = SetlistChange::fromArray($this->data(), self::NOW);

        $this->assertSame('Misa del domingo', $change->title);
        $this->assertSame('2026-11-01', $change->eventDate);
        $this->assertSame(self::NOW - 1000, $change->updatedAt);
        $this->assertSame([$this->item()], $change->items);
        $this->assertFalse($change->deleted);
    }

    public function testTheDateAndTheNotesAreOptionalAndTextIsTrimmed(): void
    {
        $change = SetlistChange::fromArray(
            $this->data(['title' => '  Misa  ', 'eventDate' => null, 'notes' => null, 'items' => []]),
            self::NOW
        );

        $this->assertSame('Misa', $change->title);
        $this->assertNull($change->eventDate);
        $this->assertSame('', $change->notes);
        $this->assertSame([], $change->items);
    }

    public function testStarredIsReadAndIsNullWhenAnOlderAppSendsNone(): void
    {
        $this->assertTrue(SetlistChange::fromArray($this->data(['starred' => true]), self::NOW)->starred);
        $this->assertFalse(SetlistChange::fromArray($this->data(['starred' => false]), self::NOW)->starred);
        $this->assertNull(SetlistChange::fromArray($this->data(), self::NOW)->starred, 'not sent: keep what is stored');
    }

    public function testAnEmptyDateMeansNone(): void
    {
        $this->assertNull(SetlistChange::fromArray($this->data(['eventDate' => '']), self::NOW)->eventDate);
    }

    public function testUnknownKeysOfAnItemAreDropped(): void
    {
        $change = SetlistChange::fromArray($this->data(['items' => [$this->item(['evil' => '<script>'])]]), self::NOW);

        $this->assertSame([$this->item()], $change->items);
    }

    public function testAnItemWithoutTransposeOrNoteGetsTheDefaults(): void
    {
        $raw = $this->item();
        unset($raw['transpose'], $raw['note']);

        $change = SetlistChange::fromArray($this->data(['items' => [$raw]]), self::NOW);

        $this->assertSame(0, $change->items[0]['transpose']);
        $this->assertSame('', $change->items[0]['note']);
    }

    /**
     * @return array<string, array{array<string, mixed>, string}>
     */
    public static function invalid(): array
    {
        $item = static fn (array $override): array => ['items' => [$override + [
            'id' => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'part' => 'entrada',
            'songId' => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'transpose' => 0, 'note' => '',
        ]]];

        return [
            'no id' => [['id' => null], 'identificador'],
            'bad id' => [['id' => 'not-a-uuid'], 'identificador'],
            'sql in the id' => [['id' => "x' OR '1'='1"], 'identificador'],
            'empty title' => [['title' => '   '], 'título'],
            'title not text' => [['title' => ['x']], 'título'],
            'long title' => [['title' => str_repeat('a', 191)], 'largo'],
            'long notes' => [['notes' => str_repeat('a', 2001)], 'largo'],
            'no date of edit' => [['updatedAt' => null], 'edición'],
            'date of edit as text' => [['updatedAt' => '1700000000000'], 'edición'],
            'negative date of edit' => [['updatedAt' => -1], 'edición'],
            'starred as a number' => [['starred' => 1], 'destacado'],
            'starred as text' => [['starred' => 'true'], 'destacado'],
            'date as a number' => [['eventDate' => 20261101], 'fecha'],
            'date in another format' => [['eventDate' => '01/11/2026'], 'fecha'],
            'date that does not exist' => [['eventDate' => '2026-02-30'], 'fecha'],
            'items not a list' => [['items' => 'x'], 'cantos'],
            'items as an object' => [['items' => ['a' => []]], 'cantos'],
            'no items key' => [['items' => null], 'cantos'],
            'an item that is not an object' => [['items' => ['x']], 'no es válido'],
            'item without id' => [$item(['id' => null]), 'identificador'],
            'item with a bad song id' => [$item(['songId' => '../etc/passwd']), 'identificador'],
            'item without part' => [$item(['part' => null]), 'parte'],
            'item with an odd part' => [$item(['part' => 'Entrada!']), 'parte'],
            'item with a long part' => [$item(['part' => str_repeat('a', 41)]), 'parte'],
            'transpose too high' => [$item(['transpose' => 12]), 'tono'],
            'transpose too low' => [$item(['transpose' => -12]), 'tono'],
            'transpose as text' => [$item(['transpose' => '2']), 'tono'],
            'transpose fractional' => [$item(['transpose' => 1.5]), 'tono'],
            'note too long' => [$item(['note' => str_repeat('a', 501)]), 'largo'],
            'note not text' => [$item(['note' => 3]), 'nota'],
        ];
    }

    /**
     * @dataProvider invalid
     *
     * @param array<string, mixed> $override
     */
    public function testInvalidSetlistsAreRefusedWithASpanishMessage(array $override, string $mentions): void
    {
        $this->expectException(InvalidSetlist::class);
        $this->expectExceptionMessageMatches('~' . $mentions . '~u');

        SetlistChange::fromArray($this->data($override), self::NOW);
    }

    public function testTheLimitsThemselvesAreAllowed(): void
    {
        $items = [];
        for ($i = 0; $i < SetlistChange::MAX_ITEMS; $i++) {
            $items[] = $this->item(['id' => $this->itemId($i), 'note' => '', 'transpose' => -11]);
        }

        $change = SetlistChange::fromArray(
            $this->data(['title' => str_repeat('ñ', 190), 'notes' => str_repeat('ñ', 2000), 'items' => $items]),
            self::NOW
        );

        $this->assertCount(80, $change->items);
        $this->assertSame(190, mb_strlen($change->title));
        $this->assertSame(-11, $change->items[0]['transpose']);
    }

    public function testMoreThanEightyItemsAreRefused(): void
    {
        $items = [];
        for ($i = 0; $i < 81; $i++) {
            $items[] = $this->item(['id' => $this->itemId($i)]);
        }

        $this->expectException(InvalidSetlist::class);
        $this->expectExceptionMessage('hasta 80');

        SetlistChange::fromArray($this->data(['items' => $items]), self::NOW);
    }

    public function testTheSameItemTwiceIsRefused(): void
    {
        $this->expectException(InvalidSetlist::class);
        $this->expectExceptionMessage('mismo identificador');

        SetlistChange::fromArray($this->data(['items' => [$this->item(), $this->item()]]), self::NOW);
    }

    public function testItemsThatAddUpToMoreThanTheColumnHoldsAreRefused(): void
    {
        // 80 notes of 500 four-byte characters: each one is within its own limit
        $items = [];
        for ($i = 0; $i < 80; $i++) {
            $items[] = $this->item(['id' => $this->itemId($i), 'note' => str_repeat('🎵', 500)]);
        }

        $this->expectException(InvalidSetlist::class);
        $this->expectExceptionMessage('demasiado grande');

        SetlistChange::fromArray($this->data(['items' => $items]), self::NOW);
    }

    public function testAClockInTheFarFutureIsPulledBack(): void
    {
        $change = SetlistChange::fromArray($this->data(['updatedAt' => self::NOW + 86_400_000]), self::NOW);

        $this->assertSame(self::NOW + SetlistChange::MAX_FUTURE_MS, $change->updatedAt);
    }

    public function testADeletionNeedsNoContentAndKeepsNone(): void
    {
        $change = SetlistChange::fromArray(
            $this->data([
                'title' => '', 'deleted' => true, 'notes' => 'x', 'items' => 'garbage', 'eventDate' => 'nope',
            ]),
            self::NOW
        );

        $this->assertTrue($change->deleted);
        $this->assertSame([], $change->items);
        $this->assertSame('', $change->notes);
        $this->assertNull($change->eventDate);
    }

    public function testADeletedSetlistIsNoLongerStarred(): void
    {
        $change = SetlistChange::fromArray($this->data(['deleted' => true, 'starred' => true]), self::NOW);

        $this->assertFalse($change->starred);
    }

    public function testADeletionStillNeedsAnId(): void
    {
        $this->expectException(InvalidSetlist::class);

        SetlistChange::fromArray($this->data(['id' => 'x', 'deleted' => true]), self::NOW);
    }

    public function testItemsAreStoredAsReadableJson(): void
    {
        $change = SetlistChange::fromArray($this->data(), self::NOW);

        $this->assertStringContainsString('Sin el último coro', $change->itemsJson());
        $this->assertSame([$this->item()], json_decode($change->itemsJson(), true));
    }
}
