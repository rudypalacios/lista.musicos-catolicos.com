<?php

declare(strict_types=1);

namespace App\Auth;

final class User
{
    public function __construct(public readonly string $id, public readonly string $email)
    {
    }
}
