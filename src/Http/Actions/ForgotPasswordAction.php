<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\Accounts;
use App\Http\Json;
use App\Http\RequestBody;
use App\Security\ProofOfWork;
use App\Security\RateLimiter;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * POST /api/forgot {email, pow: {challenge, nonce}} → 200 {ok: true}, always: there is an account with that
 * address or there is not, and the answer is the same, so the form cannot be used to find out who has one. If
 * there is, the link to choose a new password is sent. 403 `invalid_proof` when the puzzle was not solved.
 *
 * The mail cannot be turned into a way to flood a mailbox: an address gets at most 3 an hour and a network address at
 * most 8 (past the limit the answer is the same and nothing is sent).
 */
final class ForgotPasswordAction
{
    private const MAX_PER_ADDRESS = 3;
    private const MAX_PER_IP = 8;

    public function __construct(
        private readonly Accounts $accounts,
        private readonly ProofOfWork $proof,
        private readonly RateLimiter $limits,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $email = RequestBody::string($request, 'email');
        $pow = RequestBody::proof($request);
        if ($email === null || trim($email) === '') {
            return Json::error($response, 400, 'invalid_request', 'Escribe tu correo.');
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
        $address = hash('sha256', strtolower(trim($email)));
        $allowed = $this->limits->allows('forgot-ip', $ip, self::MAX_PER_IP, 3600, $now)
            && $this->limits->allows('forgot-email', $address, self::MAX_PER_ADDRESS, 3600, $now);
        $this->limits->hit('forgot-ip', $ip, $now);
        $this->limits->hit('forgot-email', $address, $now);
        if ($allowed) {
            $this->accounts->requestReset($email, $now);
        }

        return Json::respond($response, ['ok' => true]);
    }
}
