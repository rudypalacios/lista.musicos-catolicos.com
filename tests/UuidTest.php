<?php

declare(strict_types=1);

namespace Tests;

use App\Uuid;
use PHPUnit\Framework\TestCase;

final class UuidTest extends TestCase
{
    public function testItIsAVersion4Uuid(): void
    {
        $this->assertMatchesRegularExpression(
            '~^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$~',
            Uuid::v4()
        );
    }

    public function testTwoCallsDiffer(): void
    {
        $this->assertNotSame(Uuid::v4(), Uuid::v4());
    }
}
