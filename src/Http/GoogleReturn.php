<?php

declare(strict_types=1);

namespace App\Http;

use Psr\Http\Message\ResponseInterface;

/**
 * Where the browser lands when a sign-in with Google ends, one way or the other: the app's own front page, with a word the
 * app reads (`google=ok`, `new`, `cancelled`, `unverified`, `busy`, `unavailable`, `failed`; see `web/src/google-return.ts`)
 * and removes from the address. The address is the site's own (`APP_URL`), never built from the request's Host.
 */
final class GoogleReturn
{
    public static function to(ResponseInterface $response, string $appUrl, string $outcome): ResponseInterface
    {
        return $response
            ->withStatus(302)
            ->withHeader('Location', $appUrl . '/?google=' . $outcome)
            ->withHeader('Cache-Control', 'no-store');
    }
}
