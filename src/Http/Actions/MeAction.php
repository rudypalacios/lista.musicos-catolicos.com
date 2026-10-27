<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\User;
use App\Http\Json;
use App\Http\Middleware\RequireUser;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** GET /api/me → 200 {email} for a valid session, 401 otherwise (RequireUser) */
final class MeAction
{
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute(RequireUser::ATTRIBUTE);

        return Json::respond($response, ['email' => $user instanceof User ? $user->email : null]);
    }
}
