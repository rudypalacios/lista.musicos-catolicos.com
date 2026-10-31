<?php

declare(strict_types=1);

namespace Tests\Sync;

use App\Sync\TemplateChange;
use App\Sync\TemplateRepository;
use PHPUnit\Framework\TestCase;
use Tests\Support\TestDatabase;

final class TemplateRepositoryTest extends TestCase
{
    private const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    private const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    private const ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    private TemplateRepository $templates;

    protected function setUp(): void
    {
        $this->templates = new TemplateRepository(TestDatabase::migrated());
    }

    /**
     * @param list<array{id: string, name: string, off?: true, optional?: true, note?: string}> $parts
     */
    private function change(
        string $name,
        int $at,
        array $parts = [['id' => 'p-uno', 'name' => 'Cantos']],
        bool $deleted = false
    ): TemplateChange {
        return new TemplateChange(self::ID, $name, $deleted ? [] : $parts, $at, $deleted);
    }

    public function testATemplateIsStoredAndReadBackWithItsParts(): void
    {
        $parts = [
            ['id' => 'entrada', 'name' => 'Canto de entrada'],
            ['id' => 'p-ab12cd34', 'name' => 'Misterio ñ', 'optional' => true],
        ];

        $this->assertTrue($this->templates->apply(self::ME, $this->change('Rosario 🎶', 1000, $parts)));

        $rows = $this->templates->changedSince(self::ME, 0, 10);
        $this->assertCount(1, $rows);
        $this->assertSame('Rosario 🎶', $rows[0]['name']);
        $this->assertSame($parts, $rows[0]['parts']);
        $this->assertSame(1000, $rows[0]['updatedAt']);
        $this->assertNull($rows[0]['deletedAt']);
        $this->assertSame(1, $rows[0]['seq']);
    }

    public function testANewerEditReplacesItAndGetsANewNumber(): void
    {
        $this->templates->apply(self::ME, $this->change('Rosario', 1000));

        $this->assertTrue($this->templates->apply(self::ME, $this->change('Rosario del jueves', 2000)));

        $rows = $this->templates->changedSince(self::ME, 0, 10);
        $this->assertCount(1, $rows);
        $this->assertSame('Rosario del jueves', $rows[0]['name']);
        $this->assertSame(2, $rows[0]['seq']);
    }

    public function testAnOlderOrEqualEditIsIgnored(): void
    {
        $this->templates->apply(self::ME, $this->change('Desde el iPad', 5000));

        $this->assertFalse($this->templates->apply(self::ME, $this->change('Desde el teléfono', 4000)));
        $this->assertFalse($this->templates->apply(self::ME, $this->change('Otra vez', 5000)));

        $this->assertSame('Desde el iPad', $this->templates->changedSince(self::ME, 0, 10)[0]['name']);
    }

    public function testADeletionIsATombstone(): void
    {
        $this->templates->apply(self::ME, $this->change('Rosario', 1000));

        $this->templates->apply(self::ME, $this->change('Rosario', 2000, [], true));

        $row = $this->templates->changedSince(self::ME, 0, 10)[0];
        $this->assertSame(2000, $row['deletedAt']);
        $this->assertSame([], $row['parts']);
    }

    public function testAnotherUsersTemplateIsNeitherReadNorOverwritten(): void
    {
        $this->templates->apply(self::ME, $this->change('Mía', 1000));

        $this->assertFalse($this->templates->apply(self::OTHER, $this->change('De otro', 9000)));
        $this->assertSame([], $this->templates->changedSince(self::OTHER, 0, 10));
        $this->assertSame('Mía', $this->templates->changedSince(self::ME, 0, 10)[0]['name']);
    }

    public function testOnlyWhatChangedAfterTheCursorIsReturned(): void
    {
        $this->templates->apply(self::ME, $this->change('Rosario', 1000));

        $this->assertSame([], $this->templates->changedSince(self::ME, 1, 10));
    }
}
