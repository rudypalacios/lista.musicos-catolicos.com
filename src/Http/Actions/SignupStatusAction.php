<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * GET /api/signup → 200 {open: bool}: whether anyone can create an account now (SIGNUP_OPEN in .env). The app asks so
 * it only offers "Crear cuenta" when it will work. Public, and says nothing else.
 */
final class SignupStatusAction
{
    public function __construct(private readonly bool $open)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::respond($response, ['open' => $this->open]);
    }
}
