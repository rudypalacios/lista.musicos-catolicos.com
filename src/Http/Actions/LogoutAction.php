<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\Authenticator;
use App\Http\Json;
use App\Http\SessionCookie;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** POST /api/logout: ends the session on the server and clears the cookie (always 200) */
final class LogoutAction
{
    public function __construct(private readonly Authenticator $authenticator)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $token = SessionCookie::read($request);
        if ($token !== null) {
            $this->authenticator->logout($token);
        }

        return SessionCookie::clear(Json::respond($response, ['ok' => true]), $request);
    }
}
