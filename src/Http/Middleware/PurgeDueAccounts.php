<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Auth\AccountDeletion;
use App\Http\RequestBody;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Throwable;

/**
 * Deletes the accounts whose 3 days have passed, whenever somebody uses the API: the host has no cron, and one indexed query per
 * request is all it costs. A failure is logged and never reaches the request that happened to carry it.
 */
final class PurgeDueAccounts implements MiddlewareInterface
{
    public function __construct(private readonly AccountDeletion $deletion)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        try {
            $this->deletion->purgeDue(RequestBody::now());
        } catch (Throwable $e) {
            error_log('Deleting accounts that were due: ' . $e->getMessage());
        }

        return $handler->handle($request);
    }
}
