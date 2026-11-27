<?php

declare(strict_types=1);

namespace App\Auth\Google;

/** Signing in with Google, in its two halves: sending the person to Google, and receiving them back */
final class GoogleSignIn
{
    public function __construct(
        private readonly GoogleOAuth $google,
        private readonly OAuthStates $states,
        private readonly GoogleAccounts $accounts,
    ) {
    }

    /**
     * @return array{url: string, binding: string} where to send the browser, and the value to keep in its cookie
     */
    public function begin(int $now): array
    {
        $started = $this->states->issue($now);
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $started['verifier'], true)), '+/', '-_'), '=');

        return [
            'url' => $this->google->authorizationUrl($started['state'], $started['nonce'], $challenge),
            'binding' => $started['binding'],
        ];
    }

    /**
     * The browser came back from Google with a code.
     *
     * @return array{userId: string, email: string, sessionToken: string, created: bool}
     *
     * @throws GoogleFailed
     */
    public function finish(string $state, string $binding, string $code, int $now): array
    {
        $started = $this->states->consume($state, $binding, $now);
        if ($started === null) {
            throw new GoogleFailed('The return does not match a sign-in started in this browser');
        }
        $who = $this->google->identify($code, $started['verifier'], $started['nonce'], intdiv($now, 1000));

        return $this->accounts->signIn($who, $now);
    }
}
