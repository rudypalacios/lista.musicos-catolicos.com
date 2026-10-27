<?php

declare(strict_types=1);

namespace App;

/**
 * Version 4 UUIDs. The client makes its own ids so a record can be created offline; the
 * server only needs them for the rows it creates itself.
 */
final class Uuid
{
    public static function v4(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}
