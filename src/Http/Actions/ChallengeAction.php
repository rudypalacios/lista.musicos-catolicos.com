<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Http\Json;
use App\Http\RequestBody;
use App\Security\ProofOfWork;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * GET /api/challenge → 200 {challenge, bits, expiresAt}: a puzzle the browser solves before it signs up or asks for a
 * password reset (see ProofOfWork). It keeps nothing: the challenge carries its own signature.
 */
final class ChallengeAction
{
    public function __construct(private readonly ProofOfWork $proof)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::respond($response, $this->proof->issue(RequestBody::now()));
    }
}
