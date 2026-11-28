<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Auth\Authenticator;
use App\Http\Json;
use App\Http\SessionCookie;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Response;

/**
 * Lets the request through only with a valid session; the user goes in the "user" attribute. An account that asked to be deleted
 * and is in its 3 days is locked: only the routes made `allowPending` (who the session is, keeping the account) answer it, and
 * everything else is a 403 `deletion_pending`, so a device that still holds its songs cannot send or read anything.
 */
final class RequireUser implements MiddlewareInterface
{
    public const ATTRIBUTE = 'user';

    public function __construct(private readonly Authenticator $authenticator, private readonly bool $allowPending = false)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $token = SessionCookie::read($request);
        $user = $token !== null ? $this->authenticator->authenticate($token) : null;
        if ($user === null) {
            return Json::error(new Response(), 401, 'unauthenticated', 'Inicia sesión para continuar.');
        }

        if ($user->deleteAfter !== null && !$this->allowPending) {
            return Json::error(
                new Response(),
                403,
                'deletion_pending',
                'Tu cuenta está pendiente de eliminarse. Entra otra vez para conservarla.'
            );
        }

        return $handler->handle($request->withAttribute(self::ATTRIBUTE, $user));
    }
}
