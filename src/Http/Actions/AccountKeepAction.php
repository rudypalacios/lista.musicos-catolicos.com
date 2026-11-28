<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\AccountDeletion;
use App\Auth\User;
use App\Http\Json;
use App\Http\Middleware\RequireUser;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * POST /api/account/keep (session) → 200 {ok}: the person changed their mind during the 3 days. The account is as it was, with its
 * shared links. This is one of the two routes a locked account answers (RequireUser with `allowPending`).
 */
final class AccountKeepAction
{
    public function __construct(private readonly AccountDeletion $deletion)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute(RequireUser::ATTRIBUTE);
        if (!$user instanceof User) {
            return Json::error($response, 401, 'unauthenticated', 'Inicia sesión para continuar.');
        }
        $this->deletion->keep($user->id);

        return Json::respond($response, ['ok' => true]);
    }
}
