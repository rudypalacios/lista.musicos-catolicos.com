<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\Accounts;
use App\Auth\InvalidAccount;
use App\Http\Json;
use App\Http\RequestBody;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * POST /api/reset {token, password} → 200 {email}: chooses the new password with the code of the emailed link. Every
 * session of the account ends; the person signs in with the new password. 400 `weak_password` (the link is not spent),
 * 400 `invalid_token` for a link that does not work (wrong, used or expired: the same answer for all).
 */
final class ResetPasswordAction
{
    public function __construct(private readonly Accounts $accounts)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $token = RequestBody::string($request, 'token');
        $password = RequestBody::string($request, 'password');
        if ($token === null || $password === null || $password === '') {
            return Json::error($response, 400, 'invalid_request', 'Escribe la contraseña nueva.');
        }
        try {
            $email = $this->accounts->resetPassword($token, $password, RequestBody::now());
        } catch (InvalidAccount $e) {
            return Json::error($response, 400, 'weak_password', $e->getMessage());
        }
        if ($email === null) {
            return Json::error($response, 400, 'invalid_token', 'Este enlace ya no sirve. Pide uno nuevo.');
        }

        return Json::respond($response, ['email' => $email]);
    }
}
