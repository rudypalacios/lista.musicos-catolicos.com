<?php

declare(strict_types=1);

namespace App\Auth\Google;

use RuntimeException;

/** Signing in with Google did not work; `reason` is the word the app is told (see `web/src/google-return.ts`) */
final class GoogleFailed extends RuntimeException
{
    /** Anything that went wrong: a state that does not match, a code Google refused, an answer that was not understood */
    public const FAILED = 'failed';
    /** Google says the address of the account is not confirmed, so it proves nothing about who owns it */
    public const UNVERIFIED = 'unverified';

    public function __construct(string $message, public readonly string $reason = self::FAILED)
    {
        parent::__construct($message);
    }
}
