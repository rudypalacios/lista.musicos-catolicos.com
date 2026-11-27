<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * GET /api/auth-options → 200 {google: bool}: which ways of signing in this server offers, so the app only shows the
 * button of Google when the owner has set it up.
 */
final class AuthOptionsAction
{
    public function __construct(private readonly bool $google)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::respond($response, ['google' => $this->google]);
    }
}
