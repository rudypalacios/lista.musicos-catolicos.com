<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\AccountDeletion;
use App\Http\Json;
use App\Http\RequestBody;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * POST /api/account/delete-preview {token} → 200 {email, songs, lists, templates}: what the link of the deletion email will do,
 * shown before the person says yes. It needs no session (the link is opened in any browser) and does not spend the code.
 * 400 `invalid_token` for a link that does not work (wrong, used or expired: the same answer for all).
 */
final class AccountDeletePreviewAction
{
    public function __construct(private readonly AccountDeletion $deletion)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $preview = $this->deletion->preview(RequestBody::string($request, 'token') ?? '', RequestBody::now());
        if ($preview === null) {
            return Json::error($response, 400, 'invalid_token', 'Este enlace ya no sirve. Pide uno nuevo desde Ajustes, en la app.');
        }

        return Json::respond($response, $preview);
    }
}
