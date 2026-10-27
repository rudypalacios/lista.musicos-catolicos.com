<?php

declare(strict_types=1);

namespace App\Sync;

use InvalidArgumentException;

/** A song sent by a client that cannot be stored; the message is Spanish and can be shown as is */
final class InvalidSong extends InvalidArgumentException
{
}
