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

/** GET /api/lists/{id}/share → 200 {shared: false} or {shared: true, code, withLyrics}: is the list shared now */
final class ShareStatusAction
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
        if (!Uuid::isValid($id)) {
            return Json::error($response, 404, 'not_found', 'Este listado todavía no está en el servidor.');
        }

        $active = $this->shares->activeFor($user->id, $id);

        return Json::respond($response, $active === null ? ['shared' => false] : ['shared' => true] + $active);
    }
}
