<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\Accounts;
use App\Auth\User;
use App\Http\Json;
use App\Http\Middleware\RequireUser;
use App\Http\RequestBody;
use App\Security\RateLimiter;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * POST /api/verify-email/resend (session) → 200 {mailSent}: sends the confirmation link again, to the address of the
 * account in the session, and cancels the one before. An account already confirmed gets 200 and no mail. 429 after
 * 3 in an hour.
 */
final class ResendVerificationAction
{
    private const MAX_PER_HOUR = 3;

    public function __construct(private readonly Accounts $accounts, private readonly RateLimiter $limits)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute(RequireUser::ATTRIBUTE);
        if (!$user instanceof User) {
            return Json::error($response, 401, 'unauthenticated', 'Inicia sesión para continuar.');
        }
        if ($user->verified) {
            return Json::respond($response, ['mailSent' => false]);
        }
        $now = RequestBody::now();
        if (!$this->limits->allows('resend', $user->id, self::MAX_PER_HOUR, 3600, $now)) {
            return Json::error($response, 429, 'too_many_attempts', 'Ya te lo mandamos varias veces. Espera un rato.');
        }
        $this->limits->hit('resend', $user->id, $now);

        $sent = $this->accounts->sendVerification($user->id, $user->email, $now);

        return Json::respond($response, ['mailSent' => $sent]);
    }
}
