<?php

declare(strict_types=1);

namespace Tests\Sync;

use App\Sync\Sequence;
use PHPUnit\Framework\TestCase;
use Tests\Support\TestDatabase;

final class SequenceTest extends TestCase
{
    private const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    private const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    private Sequence $sequence;

    protected function setUp(): void
    {
        $this->sequence = new Sequence(TestDatabase::migrated());
    }

    public function testItStartsAtZeroAndCountsFromOne(): void
    {
        $this->assertSame(0, $this->sequence->latest(self::ME));
        $this->assertSame(1, $this->sequence->next(self::ME));
        $this->assertSame(2, $this->sequence->next(self::ME));
        $this->assertSame(2, $this->sequence->latest(self::ME));
    }

    public function testEachUserCountsOnTheirOwn(): void
    {
        $this->sequence->next(self::ME);
        $this->sequence->next(self::ME);

        $this->assertSame(1, $this->sequence->next(self::OTHER));
        $this->assertSame(2, $this->sequence->latest(self::ME));
    }
}
