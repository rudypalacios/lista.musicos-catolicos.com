<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\Authenticator;
use App\Auth\TooManyAttemptsException;
use App\Http\Json;
use App\Http\SessionCookie;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * POST /api/login {email, password} → 200 {email} and the session cookie;
 * 400 without both fields, 401 for wrong credentials, 429 after too many failures.
 */
final class LoginAction
{
    public function __construct(private readonly Authenticator $authenticator)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = $request->getParsedBody();
        $email = is_array($body) ? ($body['email'] ?? null) : null;
        $password = is_array($body) ? ($body['password'] ?? null) : null;
        if (!is_string($email) || !is_string($password) || $email === '' || $password === '') {
            return Json::error($response, 400, 'invalid_request', 'Escribe tu correo y tu contraseña.');
        }

        $ip = (string) ($request->getServerParams()['REMOTE_ADDR'] ?? 'unknown');

        try {
            $token = $this->authenticator->login($email, $password, $ip);
        } catch (TooManyAttemptsException) {
            return Json::error($response, 429, 'too_many_attempts', 'Demasiados intentos. Espera unos minutos.');
        }
        if ($token === null) {
            return Json::error($response, 401, 'invalid_credentials', 'Correo o contraseña incorrectos.');
        }

        return SessionCookie::set(Json::respond($response, ['email' => strtolower(trim($email))]), $request, $token);
    }
}
