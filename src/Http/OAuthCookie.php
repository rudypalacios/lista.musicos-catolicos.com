<?php

declare(strict_types=1);

namespace App\Http;

use App\Auth\Google\OAuthStates;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * The cookie that ties a sign-in with Google to the browser that started it (see `OAuthStates`). It lives 10 minutes, only
 * the Google routes receive it, scripts cannot read it, and it is SameSite=Lax because the browser comes back from
 * Google's site by following a link (a cookie that was Strict would not be sent).
 */
final class OAuthCookie
{
    public const NAME = 'lista_oauth';
    private const PATH = '/api/google';

    public static function read(ServerRequestInterface $request): ?string
    {
        $value = $request->getCookieParams()[self::NAME] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }

    public static function set(
        ResponseInterface $response,
        ServerRequestInterface $request,
        string $binding
    ): ResponseInterface {
        $ttl = OAuthStates::COOKIE_TTL_SECONDS;

        return $response->withAddedHeader('Set-Cookie', self::header($request, $binding, $ttl));
    }

    public static function clear(ResponseInterface $response, ServerRequestInterface $request): ResponseInterface
    {
        return $response->withAddedHeader('Set-Cookie', self::header($request, '', 0));
    }

    private static function header(ServerRequestInterface $request, string $value, int $maxAge): string
    {
        return self::NAME . '=' . $value . '; Path=' . self::PATH . '; Max-Age=' . $maxAge . '; HttpOnly; SameSite=Lax'
            . ($request->getUri()->getScheme() === 'https' ? '; Secure' : '');
    }
}
