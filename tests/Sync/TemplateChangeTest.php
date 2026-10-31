<?php

declare(strict_types=1);

namespace Tests\Sync;

use App\Sync\InvalidTemplate;
use App\Sync\TemplateChange;
use PHPUnit\Framework\TestCase;

final class TemplateChangeTest extends TestCase
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
            'id' => self::ID, 'name' => 'Rosario', 'updatedAt' => self::NOW - 1000, 'deleted' => false,
            'parts' => [
                ['id' => 'p-uno', 'name' => 'Primer misterio'],
                ['id' => 'p-dos', 'name' => 'Segundo', 'optional' => true],
            ],
        ];
    }

    public function testAValidTemplateIsRead(): void
    {
        $change = TemplateChange::fromArray($this->data(['name' => '  Rosario  ']), self::NOW);

        $this->assertSame('Rosario', $change->name);
        $this->assertSame(self::NOW - 1000, $change->updatedAt);
        $this->assertFalse($change->deleted);
        $this->assertSame(
            [
                ['id' => 'p-uno', 'name' => 'Primer misterio'],
                ['id' => 'p-dos', 'name' => 'Segundo', 'optional' => true],
            ],
            $change->parts
        );
        $this->assertStringContainsString('Primer misterio', $change->partsJson());
    }

    /**
     * @return array<string, array{array<string, mixed>, string}>
     */
    public static function invalid(): array
    {
        return [
            'no id' => [['id' => null], 'identificador'],
            'a bad id' => [['id' => 'x'], 'identificador'],
            'no name' => [['name' => '  '], 'necesita un nombre'],
            'name not text' => [['name' => 3], 'nombre'],
            'long name' => [['name' => str_repeat('a', 61)], 'largo'],
            'no date of edit' => [['updatedAt' => null], 'edición'],
            'no parts' => [['parts' => null], 'sección'],
            'empty parts' => [['parts' => []], 'sección'],
            'a part without a name' => [['parts' => [['id' => 'a', 'name' => '']]], 'nombre'],
            'two parts with one id' => [
                ['parts' => [['id' => 'a', 'name' => 'A'], ['id' => 'a', 'name' => 'B']]], 'mismo identificador',
            ],
            'too many parts' => [
                ['parts' => array_map(static fn (int $i): array => ['id' => 'p-' . $i, 'name' => 'S'], range(1, 31))],
                'hasta 30',
            ],
        ];
    }

    /**
     * @dataProvider invalid
     *
     * @param array<string, mixed> $override
     */
    public function testInvalidTemplatesAreRefusedWithASpanishMessage(array $override, string $mentions): void
    {
        $this->expectException(InvalidTemplate::class);
        $this->expectExceptionMessageMatches('~' . $mentions . '~u');

        TemplateChange::fromArray($this->data($override), self::NOW);
    }

    public function testADeletionKeepsTheNameAndNeedsNoParts(): void
    {
        $change = TemplateChange::fromArray(
            $this->data(['deleted' => true, 'parts' => null, 'name' => 'Rosario']),
            self::NOW
        );

        $this->assertTrue($change->deleted);
        $this->assertSame([], $change->parts);
        $this->assertSame('Rosario', $change->name);
    }

    public function testADateFarInTheFutureIsPulledBack(): void
    {
        $change = TemplateChange::fromArray($this->data(['updatedAt' => self::NOW + 86_400_000]), self::NOW);

        $this->assertLessThanOrEqual(self::NOW + TemplateChange::MAX_FUTURE_MS, $change->updatedAt);
    }
}
