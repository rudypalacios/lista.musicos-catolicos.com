<?php

declare(strict_types=1);

namespace App\Auth;

use RuntimeException;

/** An email or a password the app does not accept; the message is in Spanish and says what to fix */
final class InvalidAccount extends RuntimeException
{
    public function __construct(string $message, public readonly string $field)
    {
        parent::__construct($message);
    }
}
