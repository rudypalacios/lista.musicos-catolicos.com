<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\User;
use App\Http\Json;
use App\Http\Middleware\RequireUser;
use App\Share\SongShareRepository;
use App\Uuid;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * The person's side of sharing one song, with a session. A song always goes with its lyrics and chords, so unlike a
 * list's share there is no body to send.
 *
 * GET    /api/songs/{id}/share → 200 {shared: false} or {shared: true, code}
 * PUT    /api/songs/{id}/share → 200 {shared: true, code}: shares it (making the link the first time); a song the
 *                                server does not have yet (made offline, not synced) is a 404 that says so
 * DELETE /api/songs/{id}/share → 200 {shared: false}: the link stops working at once, for good
 */
final class SongShareAction
{
    private const NOT_ON_SERVER = 'Este canto todavía no está en el servidor. '
        . 'Espera a que se sincronice e inténtalo de nuevo.';

    public function __construct(private readonly SongShareRepository $shares)
    {
    }

    /** @param array<string, string> $args */
    public function status(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->user($request);
        if ($user === null) {
            return $this->unauthenticated($response);
        }
        $id = $args['id'] ?? '';
        $code = Uuid::isValid($id) ? $this->shares->activeFor($user->id, $id) : null;

        return Json::respond($response, $code === null ? ['shared' => false] : ['shared' => true, 'code' => $code]);
    }

    /** @param array<string, string> $args */
    public function enable(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->user($request);
        if ($user === null) {
            return $this->unauthenticated($response);
        }
        $id = $args['id'] ?? '';
        $code = Uuid::isValid($id) ? $this->shares->enable($user->id, $id, (int) (microtime(true) * 1000)) : null;
        if ($code === null) {
            return Json::error($response, 404, 'not_found', self::NOT_ON_SERVER);
        }

        return Json::respond($response, ['shared' => true, 'code' => $code]);
    }

    /** @param array<string, string> $args */
    public function revoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->user($request);
        if ($user === null) {
            return $this->unauthenticated($response);
        }
        $id = $args['id'] ?? '';
        if (!Uuid::isValid($id) || !$this->shares->revoke($user->id, $id, (int) (microtime(true) * 1000))) {
            return Json::error($response, 404, 'not_found', self::NOT_ON_SERVER);
        }

        return Json::respond($response, ['shared' => false]);
    }

    private function user(ServerRequestInterface $request): ?User
    {
        $user = $request->getAttribute(RequireUser::ATTRIBUTE);

        return $user instanceof User ? $user : null;
    }

    private function unauthenticated(ResponseInterface $response): ResponseInterface
    {
        return Json::error($response, 401, 'unauthenticated', 'Inicia sesión para continuar.');
    }
}
