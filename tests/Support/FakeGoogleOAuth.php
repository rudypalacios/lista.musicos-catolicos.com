<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Auth\Google\GoogleFailed;
use App\Auth\Google\GoogleIdentity;
use App\Auth\Google\GoogleOAuth;

/** Google for a test: says who the person is without a network, and remembers what it was asked */
final class FakeGoogleOAuth implements GoogleOAuth
{
    public ?GoogleIdentity $identity = null;
    public ?GoogleFailed $failure = null;
    /** @var list<array{code: string, verifier: string, nonce: string}> */
    public array $exchanges = [];
    /** @var list<array{state: string, nonce: string, challenge: string}> */
    public array $authorizations = [];

    public function authorizationUrl(string $state, string $nonce, string $challenge): string
    {
        $this->authorizations[] = ['state' => $state, 'nonce' => $nonce, 'challenge' => $challenge];

        return 'https://google.test/auth?state=' . $state;
    }

    public function identify(string $code, string $verifier, string $nonce, int $nowSeconds): GoogleIdentity
    {
        $this->exchanges[] = ['code' => $code, 'verifier' => $verifier, 'nonce' => $nonce];
        if ($this->failure !== null) {
            throw $this->failure;
        }

        return $this->identity ?? throw new GoogleFailed('No identity set in the test');
    }
}
