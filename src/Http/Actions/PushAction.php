<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\User;
use App\Http\Json;
use App\Http\Middleware\RequireUser;
use App\Sync\InvalidSetlist;
use App\Sync\InvalidSong;
use App\Sync\SetlistChange;
use App\Sync\SetlistRepository;
use App\Sync\SongChange;
use App\Sync\SongRepository;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * POST /api/sync {songs?: [{id, title, author, body, updatedAt, deleted}],
 * setlists?: [{id, title, eventDate, notes, items, updatedAt, deleted}]} → 200
 * {applied: [id…], ignored: [id…]}. Each record is whole, with the client's own timestamp
 * (epoch milliseconds); the server keeps the newest. "ignored" are the ones it already had in
 * an equal or newer form: the client gets the winner on its next pull. At least one of the
 * two lists must be present.
 *
 * All or nothing as far as validation goes: one invalid record answers 400 and stores none, so
 * a client never has to guess which half of a batch arrived.
 */
final class PushAction
{
    public const MAX_SONGS = 100;
    public const MAX_SETLISTS = 100;

    public function __construct(
        private readonly SongRepository $songs,
        private readonly SetlistRepository $setlists,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute(RequireUser::ATTRIBUTE);
        if (!$user instanceof User) {
            return Json::error($response, 401, 'unauthenticated', 'Inicia sesión para continuar.');
        }

        $body = $request->getParsedBody();
        $body = is_array($body) ? $body : [];
        $songItems = $this->list($body, 'songs', self::MAX_SONGS);
        $setlistItems = $this->list($body, 'setlists', self::MAX_SETLISTS);
        if ($songItems === null || $setlistItems === null || (!isset($body['songs']) && !isset($body['setlists']))) {
            return Json::error($response, 400, 'invalid_request', 'La petición no es válida.');
        }

        $now = (int) round(microtime(true) * 1000);
        $songChanges = [];
        $setlistChanges = [];
        try {
            foreach ($songItems as $item) {
                if (!is_array($item)) {
                    throw new InvalidSong('Un canto no es válido.');
                }
                $songChanges[] = SongChange::fromArray($item, $now);
            }
        } catch (InvalidSong $e) {
            return Json::error($response, 400, 'invalid_song', $e->getMessage());
        }
        try {
            foreach ($setlistItems as $item) {
                if (!is_array($item)) {
                    throw new InvalidSetlist('Un listado no es válido.');
                }
                $setlistChanges[] = SetlistChange::fromArray($item, $now);
            }
        } catch (InvalidSetlist $e) {
            return Json::error($response, 400, 'invalid_setlist', $e->getMessage());
        }

        $applied = [];
        $ignored = [];
        foreach ($songChanges as $change) {
            if ($this->songs->apply($user->id, $change)) {
                $applied[] = $change->id;
            } else {
                $ignored[] = $change->id;
            }
        }
        foreach ($setlistChanges as $change) {
            if ($this->setlists->apply($user->id, $change)) {
                $applied[] = $change->id;
            } else {
                $ignored[] = $change->id;
            }
        }

        return Json::respond($response, ['applied' => $applied, 'ignored' => $ignored]);
    }

    /**
     * The list under `$key` of the body: empty when absent, null when it is not a list or is too long.
     *
     * @param array<mixed> $body
     *
     * @return list<mixed>|null
     */
    private function list(array $body, string $key, int $max): ?array
    {
        if (!array_key_exists($key, $body)) {
            return [];
        }
        $items = $body[$key];

        return is_array($items) && array_is_list($items) && count($items) <= $max ? $items : null;
    }
}
