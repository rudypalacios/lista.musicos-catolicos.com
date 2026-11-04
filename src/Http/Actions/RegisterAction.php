<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\Accounts;
use App\Auth\EmailTaken;
use App\Auth\InvalidAccount;
use App\Http\Json;
use App\Http\RequestBody;
use App\Http\SessionCookie;
use App\Security\ProofOfWork;
use App\Security\RateLimiter;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * POST /api/register {email, password, pow: {challenge, nonce}} → 201 {email, verified: false, mailSent} and
 * the session cookie: the person is in at once and the link that confirms the address is on its way.
 * 400 for an address or a password that is not accepted (`invalid_email`, `weak_password`) or a missing field, 403
 * `invalid_proof` when the puzzle was not solved, 409 `email_taken`, 429 after too many sign-ups from one address.
 *
 * The 409 tells whether an address has an account; that is the price of telling the person what went wrong at the
 * moment they sign up, and the puzzle and the limit per address are what stand between it and someone asking for
 * a list.
 */
final class RegisterAction
{
    /** Sign-ups one address may make in an hour (a family on one network is not locked out; a script is) */
    public const MAX_PER_HOUR = 6;

    public function __construct(
        private readonly Accounts $accounts,
        private readonly ProofOfWork $proof,
        private readonly RateLimiter $limits,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $email = RequestBody::string($request, 'email');
        $password = RequestBody::string($request, 'password');
        $pow = RequestBody::proof($request);
        if ($email === null || $password === null || $email === '' || $password === '') {
            return Json::error($response, 400, 'invalid_request', 'Escribe tu correo y una contraseña.');
        }

        // What can be said without touching the database goes first, so a typo does not spend the puzzle
        try {
            $clean = Accounts::cleanEmail($email);
            Accounts::checkPassword($password);
        } catch (InvalidAccount $e) {
            $code = $e->field === 'email' ? 'invalid_email' : 'weak_password';

            return Json::error($response, 400, $code, $e->getMessage());
        }

        $now = RequestBody::now();
        if ($pow === null || !$this->proof->accept($pow['challenge'], $pow['nonce'], $now)) {
            return Json::error(
                $response,
                403,
                'invalid_proof',
                'No se pudo comprobar que eres una persona. Inténtalo de nuevo.'
            );
        }
        $ip = RequestBody::ip($request);
        if (!$this->limits->allows('register', $ip, self::MAX_PER_HOUR, 3600, $now)) {
            return Json::error($response, 429, 'too_many_attempts', 'Demasiados intentos. Espera un rato.');
        }
        $this->limits->hit('register', $ip, $now);

        try {
            $account = $this->accounts->register($clean, $password, $now);
        } catch (EmailTaken) {
            return Json::error($response, 409, 'email_taken', 'Ese correo ya tiene una cuenta. Inicia sesión.');
        }

        return SessionCookie::set(
            Json::respond(
                $response,
                ['email' => $account['email'], 'verified' => false, 'mailSent' => $account['mailSent']],
                201
            ),
            $request,
            $account['sessionToken']
        );
    }
}
