<?php

declare(strict_types=1);

namespace App\Auth\Google;

/** The two things the app asks of Google; a stand-in takes its place in tests */
interface GoogleOAuth
{
    /** The address of Google's page where the person chooses an account and agrees; `challenge` is the PKCE one */
    public function authorizationUrl(string $state, string $nonce, string $challenge): string;

    /**
     * Trades the code Google gave the browser for who the person is.
     *
     * @throws GoogleFailed
     */
    public function identify(string $code, string $verifier, string $nonce, int $nowSeconds): GoogleIdentity;
}
