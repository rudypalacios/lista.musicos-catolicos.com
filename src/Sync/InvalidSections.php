<?php

declare(strict_types=1);

namespace App\Sync;

use InvalidArgumentException;

/** The sections of a list or a template that cannot be stored; the message is Spanish and can be shown as is */
final class InvalidSections extends InvalidArgumentException
{
}
