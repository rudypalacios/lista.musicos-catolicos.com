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

/**
 * PUT /api/lists/{id}/share {withLyrics: bool} → 200 {shared: true, code, withLyrics}: shares the list (making its
 * link the first time) or changes whether the lyrics and chords go with it. A list the server does not have yet
 * (made offline, not synced) is a 404 that says so.
 */
final class ShareEnableAction
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
        $body = $request->getParsedBody();
        $withLyrics = is_array($body) ? ($body['withLyrics'] ?? null) : null;
        if (!is_bool($withLyrics)) {
            return Json::error(
                $response,
                400,
                'invalid_request',
                'Falta decir si el enlace lleva la letra y los acordes.'
            );
        }

        $id = $args['id'] ?? '';
        $now = (int) (microtime(true) * 1000);
        $share = Uuid::isValid($id) ? $this->shares->enable($user->id, $id, $withLyrics, $now) : null;
        if ($share === null) {
            return Json::error(
                $response,
                404,
                'not_found',
                'Este listado todavía no está en el servidor. Espera a que se sincronice e inténtalo de nuevo.'
            );
        }

        return Json::respond($response, ['shared' => true] + $share);
    }
}
