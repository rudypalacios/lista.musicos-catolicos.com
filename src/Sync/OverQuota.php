<?php

declare(strict_types=1);

namespace App\Sync;

/** An account asked to keep more than it may; the message is for the person (Spanish) and says which limit and what to do */
final class OverQuota extends \RuntimeException
{
}
