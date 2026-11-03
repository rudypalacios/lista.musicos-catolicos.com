<?php

declare(strict_types=1);

namespace App\Auth;

final class User
{
    /** @param bool $verified whether the person proved the email is theirs (a link sent to it was opened) */
    public function __construct(
        public readonly string $id,
        public readonly string $email,
        public readonly bool $verified = true,
    ) {
    }
}
