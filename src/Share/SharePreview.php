<?php

declare(strict_types=1);

namespace App\Share;

use App\Auth\TooManyAttemptsException;

/**
 * What a chat app shows when a link is pasted into it: the name of the list or of the song the link opens. Those apps
 * read only the HTML the server sends (they do not run the page's scripts), so the server has to put the name there.
 *
 * It says exactly what the page itself says to anyone with the link and nothing more, and a link that shows nothing
 * (stopped, never given, malformed) gets no preview, so the plain page is all it can tell apart. Misses count against
 * the same limit as the JSON endpoint, so this address is no easier a place to look for codes.
 */
final class SharePreview
{
    public function __construct(
        private readonly ShareRepository $lists,
        private readonly SongShareRepository $songs,
        private readonly MissThrottle $throttle
    ) {
    }

    /** @return array{kind: 'list'|'song', title: string}|null null when there is nothing to preview */
    public function of(string $code, string $ip): ?array
    {
        if (preg_match('~^[0-9a-f]{32}$~', $code) !== 1) {
            return null;
        }
        try {
            $this->throttle->assertAllowed($ip);
        } catch (TooManyAttemptsException) {
            return null;
        }

        $title = $this->lists->titleOf($code);
        if ($title !== null) {
            return ['kind' => 'list', 'title' => $title];
        }
        $title = $this->songs->titleOf($code);
        if ($title !== null) {
            return ['kind' => 'song', 'title' => $title];
        }
        $this->throttle->record($ip);

        return null;
    }
}
