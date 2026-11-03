<?php

declare(strict_types=1);

namespace App\Auth;

use RuntimeException;

final class EmailTaken extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('There is already an account with this email');
    }
}
