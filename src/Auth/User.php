<?php

declare(strict_types=1);

namespace App\Auth;

final class User
{
    /**
     * @param bool $verified whether the person proved the email is theirs (a link sent to it was opened)
     * @param int|null $deleteAfter when the account will be deleted (epoch ms) if the person asked to delete it and has not
     * changed their mind; null for an account as any other
     * @param bool $google whether the account has a Google identity (it signs in with Google)
     */
    public function __construct(
        public readonly string $id,
        public readonly string $email,
        public readonly bool $verified = true,
        public readonly ?int $deleteAfter = null,
        public readonly bool $google = false,
    ) {
    }
}
