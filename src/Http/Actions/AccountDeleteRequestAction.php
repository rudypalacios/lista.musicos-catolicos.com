<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\AccountDeletion;
use App\Auth\User;
use App\Http\Json;
use App\Http\Middleware\RequireUser;
use App\Http\RequestBody;
use App\Security\RateLimiter;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * POST /api/account/delete-request (session) → 200 {mailSent}: step 1 of deleting the account. It sends the link that asks the
 * person to confirm, to the address of the account; nothing changes until the link is opened and answered. 429 after 3 in an hour.
 */
final class AccountDeleteRequestAction
{
    private const MAX_PER_HOUR = 3;

    public function __construct(private readonly AccountDeletion $deletion, private readonly RateLimiter $limits)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute(RequireUser::ATTRIBUTE);
        if (!$user instanceof User) {
            return Json::error($response, 401, 'unauthenticated', 'Inicia sesión para continuar.');
        }
        $now = RequestBody::now();
        if (!$this->limits->allows('delete-request', $user->id, self::MAX_PER_HOUR, 3600, $now)) {
            return Json::error($response, 429, 'too_many_attempts', 'Ya te lo mandamos varias veces. Espera un rato.');
        }
        $this->limits->hit('delete-request', $user->id, $now);

        return Json::respond($response, ['mailSent' => $this->deletion->request($user, $now)]);
    }
}
