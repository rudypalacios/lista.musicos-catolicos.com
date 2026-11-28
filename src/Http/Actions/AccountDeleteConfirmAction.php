<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\AccountDeletion;
use App\Http\Json;
use App\Http\RequestBody;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * POST /api/account/delete-confirm {token} → 200 {email, deleteAfter}: step 2, the person said yes on the page of the link. The
 * account is locked for 3 days (`deleteAfter` is when it will be deleted, epoch ms) and every session of it ends. Opening the link
 * alone never gets here: the page asks first, so a program that reads links in emails cannot delete anything. 400 `invalid_token`
 * for a link that does not work.
 */
final class AccountDeleteConfirmAction
{
    public function __construct(private readonly AccountDeletion $deletion)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $done = $this->deletion->confirm(RequestBody::string($request, 'token') ?? '', RequestBody::now());
        if ($done === null) {
            return Json::error($response, 400, 'invalid_token', 'Este enlace ya no sirve. Pide uno nuevo desde Ajustes, en la app.');
        }

        return Json::respond($response, $done);
    }
}
