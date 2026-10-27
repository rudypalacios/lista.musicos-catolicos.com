<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\User;
use App\Http\Json;
use App\Http\Middleware\RequireUser;
use App\Sync\InvalidSong;
use App\Sync\SongChange;
use App\Sync\SongRepository;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * POST /api/sync {songs: [{id, title, author, body, updatedAt, deleted}]} → 200
 * {applied: [id…], ignored: [id…]}. Each song is the whole record with the client's own
 * timestamp (epoch milliseconds); the server keeps the newest. "ignored" are the ones it
 * already had in an equal or newer form: the client gets the winner on its next pull.
 *
 * All or nothing as far as validation goes: one invalid song answers 400 and stores none, so
 * a client never has to guess which half of a batch arrived.
 */
final class PushAction
{
    public const MAX_SONGS = 100;

    public function __construct(private readonly SongRepository $songs)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute(RequireUser::ATTRIBUTE);
        if (!$user instanceof User) {
            return Json::error($response, 401, 'unauthenticated', 'Inicia sesión para continuar.');
        }

        $body = $request->getParsedBody();
        $items = is_array($body) ? ($body['songs'] ?? null) : null;
        if (!is_array($items) || !array_is_list($items) || count($items) > self::MAX_SONGS) {
            return Json::error($response, 400, 'invalid_request', 'La lista de cantos no es válida.');
        }

        $now = (int) round(microtime(true) * 1000);
        $changes = [];
        try {
            foreach ($items as $item) {
                if (!is_array($item)) {
                    throw new InvalidSong('Un canto no es válido.');
                }
                $changes[] = SongChange::fromArray($item, $now);
            }
        } catch (InvalidSong $e) {
            return Json::error($response, 400, 'invalid_song', $e->getMessage());
        }

        $applied = [];
        $ignored = [];
        foreach ($changes as $change) {
            if ($this->songs->apply($user->id, $change)) {
                $applied[] = $change->id;
            } else {
                $ignored[] = $change->id;
            }
        }

        return Json::respond($response, ['applied' => $applied, 'ignored' => $ignored]);
    }
}
