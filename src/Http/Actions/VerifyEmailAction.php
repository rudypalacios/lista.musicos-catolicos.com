<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\Accounts;
use App\Http\Json;
use App\Http\RequestBody;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * POST /api/verify-email {token} → 200 {email}: the link of the confirmation email, opened. It needs no session: the
 * link is often opened in another browser than the one that signed up. 400 `invalid_token` for a link that does not
 * work (wrong, used or expired: the same answer for all).
 */
final class VerifyEmailAction
{
    public function __construct(private readonly Accounts $accounts)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $email = $this->accounts->verify(RequestBody::string($request, 'token') ?? '', RequestBody::now());
        if ($email === null) {
            return Json::error(
                $response,
                400,
                'invalid_token',
                'Este enlace ya no sirve. Pide uno nuevo desde la app.'
            );
        }

        return Json::respond($response, ['email' => $email]);
    }
}
