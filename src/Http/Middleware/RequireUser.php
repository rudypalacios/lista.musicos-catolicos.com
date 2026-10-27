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

/** Lets the request through only with a valid session; the user goes in the "user" attribute */
final class RequireUser implements MiddlewareInterface
{
    public const ATTRIBUTE = 'user';

    public function __construct(private readonly Authenticator $authenticator)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $token = SessionCookie::read($request);
        $user = $token !== null ? $this->authenticator->authenticate($token) : null;
        if ($user === null) {
            return Json::error(new Response(), 401, 'unauthenticated', 'Inicia sesión para continuar.');
        }

        return $handler->handle($request->withAttribute(self::ATTRIBUTE, $user));
    }
}
