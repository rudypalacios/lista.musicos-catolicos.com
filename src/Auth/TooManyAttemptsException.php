<?php

declare(strict_types=1);

namespace App\Auth;

use RuntimeException;

final class TooManyAttemptsException extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Too many failed sign-in attempts');
    }
}
