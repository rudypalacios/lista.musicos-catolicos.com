<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\User;
use App\Http\Json;
use App\Http\Middleware\RequireUser;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * GET /api/me → 200 {email, verified, google, deleteAfter} for a valid session, 401 otherwise (RequireUser). `google` says the account
 * signs in with Google; `deleteAfter` is when it will be deleted (epoch ms) if it is in its 3 days, null otherwise. A locked account
 * answers this route (and `keep`), so the app can offer to keep it.
 */
final class MeAction
{
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute(RequireUser::ATTRIBUTE);

        return Json::respond($response, [
            'email' => $user instanceof User ? $user->email : null,
            'verified' => $user instanceof User ? $user->verified : false,
            'google' => $user instanceof User ? $user->google : false,
            'deleteAfter' => $user instanceof User ? $user->deleteAfter : null,
        ]);
    }
}
