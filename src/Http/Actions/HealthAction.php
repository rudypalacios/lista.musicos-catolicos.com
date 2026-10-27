<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Database\Migrator;
use App\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** GET /api/health: the app and its database answer (also what the deploy can be checked with) */
final class HealthAction
{
    public function __construct(private readonly Migrator $migrator)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return Json::respond($response, ['status' => 'ok', 'schema' => $this->migrator->currentVersion()]);
    }
}
