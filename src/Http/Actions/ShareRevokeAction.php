<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\User;
use App\Http\Json;
use App\Http\Middleware\RequireUser;
use App\Share\ShareRepository;
use App\Uuid;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** DELETE /api/lists/{id}/share → 200 {shared: false}: stops sharing; the link stops working at once, for good */
final class ShareRevokeAction
{
    public function __construct(private readonly ShareRepository $shares)
    {
    }

    /** @param array<string, string> $args */
    public function __invoke(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $user = $request->getAttribute(RequireUser::ATTRIBUTE);
        if (!$user instanceof User) {
            return Json::error($response, 401, 'unauthenticated', 'Inicia sesión para continuar.');
        }
        $id = $args['id'] ?? '';
        if (!Uuid::isValid($id) || !$this->shares->revoke($user->id, $id, (int) (microtime(true) * 1000))) {
            return Json::error($response, 404, 'not_found', 'Este listado todavía no está en el servidor.');
        }

        return Json::respond($response, ['shared' => false]);
    }
}
