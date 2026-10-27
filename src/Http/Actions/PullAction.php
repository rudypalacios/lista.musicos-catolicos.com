<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\User;
use App\Http\Json;
use App\Http\Middleware\RequireUser;
use App\Sync\SongRepository;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * GET /api/sync?since=N → 200 {songs: [...], cursor, hasMore}: the songs that changed after
 * change number N (0 for everything), deleted ones included (`deletedAt`), oldest first. A
 * client keeps asking with the returned `cursor` while `hasMore` is true.
 */
final class PullAction
{
    public const PAGE = 200;

    public function __construct(private readonly SongRepository $songs)
    {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute(RequireUser::ATTRIBUTE);
        if (!$user instanceof User) {
            return Json::error($response, 401, 'unauthenticated', 'Inicia sesión para continuar.');
        }

        $since = $request->getQueryParams()['since'] ?? '0';
        if (!is_string($since) || preg_match('~^\d{1,15}$~', $since) !== 1) {
            return Json::error($response, 400, 'invalid_request', 'El punto de partida no es válido.');
        }

        $songs = $this->songs->changedSince($user->id, (int) $since, self::PAGE + 1);
        $hasMore = count($songs) > self::PAGE;
        $songs = array_slice($songs, 0, self::PAGE);
        $last = $songs === [] ? null : end($songs);

        return Json::respond($response, [
            'songs' => $songs,
            'cursor' => $last !== null ? $last['seq'] : (int) $since,
            'hasMore' => $hasMore,
        ]);
    }
}
