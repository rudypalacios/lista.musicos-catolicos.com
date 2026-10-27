<?php

declare(strict_types=1);

namespace App\Http;

use App\Auth\Authenticator;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * The cookie that carries the session token: HttpOnly (scripts cannot read it), SameSite=Lax
 * (other sites cannot make the browser send it with a POST) and Secure over HTTPS.
 */
final class SessionCookie
{
    public const NAME = 'lista_session';

    public static function read(ServerRequestInterface $request): ?string
    {
        $token = $request->getCookieParams()[self::NAME] ?? null;

        return is_string($token) && $token !== '' ? $token : null;
    }

    public static function set(
        ResponseInterface $response,
        ServerRequestInterface $request,
        string $token
    ): ResponseInterface {
        return $response->withAddedHeader(
            'Set-Cookie',
            self::header($request, $token, Authenticator::SESSION_DAYS * 86400)
        );
    }

    public static function clear(ResponseInterface $response, ServerRequestInterface $request): ResponseInterface
    {
        return $response->withAddedHeader('Set-Cookie', self::header($request, '', 0));
    }

    private static function header(ServerRequestInterface $request, string $value, int $maxAge): string
    {
        return self::NAME . '=' . $value . '; Path=/; Max-Age=' . $maxAge . '; HttpOnly; SameSite=Lax'
            . ($request->getUri()->getScheme() === 'https' ? '; Secure' : '');
    }
}
