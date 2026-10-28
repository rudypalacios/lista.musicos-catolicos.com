# Lista

Offline-first PWA to plan the music of a Mass. Private for now, built to be folded into
[Músicos Católicos](https://www.musicos-catolicos.com) later.

- **Client:** TypeScript, no framework, bundled with esbuild. IndexedDB for data, a service
  worker for the app shell.
- **Server:** Slim 4 + PDO, JSON API under `/api`, MySQL in production (SQLite locally).
- **Deploy:** GitHub Actions builds and uploads by FTPS on every merge to `main`.

## Layout

| Path | What |
|---|---|
| `web/src/` | The app: `main.ts` (shell, tabs, router), `views/` (songs: list, editor, importer, viewer; setlists: `lists`, `setlist`, `add`, `perform`; `reader` is the song reader both viewers share; `install` is the install guide; `settings` is the Ajustes screen), `app.ts` (store, sync) |
| `web/src/chordpro/` | ChordPro parser, chords, transposition, lyrics renderer: ports of the public site's PHP and `song.js` |
| `web/src/data/` | Songs and setlists on the device (IndexedDB, one store contract for both collections), the queues of unsent records, the sync engine; `library.ts` and `setlists.ts` are the operations on each |
| `web/src/` (others) | `importer.ts` (chords above the words → ChordPro; one song or a whole Mass), `fit.ts` (fit to the screen), `mass.ts` (parts of the Mass), `install.ts` (is this Safari on iOS, or the installed app?), `toast.ts` (the "Guardado" message), `settings.ts` (lyric colours; the settings themselves are in `prefs.ts`, on the device), `sw.ts` (service worker) |
| `web/src/print/` | Printing: `layout.ts` (the `PrintLayout.php` cascade, ported as it is), `plan.ts` (what a page prints: header, musical data, key), `print.ts` (fills `#print-root` and calls `window.print()`), `print.css` (copied from the public site's print rules) |
| `web/fonts/` | The fonts the public site prints with (Atkinson Hyperlegible, Bricolage Grotesque; OFL), served from this origin so a printout looks the same and works offline |
| `web/test/` | Unit tests of the client (`node --test`); `fixtures/golden.json` is what the PHP answered |
| `scripts/` | The build, and `fixtures/` that regenerates the golden file from musicos-catolicos (parser, chords, syllables and the print cascade) |
| `src/` | PHP: `Http/` (actions, middleware), `Auth/`, `Sync/` (songs, setlists, the shared change counter and the combined feed), `Database/` |
| `migrations/` | Numbered SQL files, applied by the app on its first request after a deploy |
| `public/` | Web root: `index.php`, `.htaccess`, icons, manifest; the build adds the rest |
| `tests/` | PHPUnit tests, and `e2e/` (Chromium: sign-in and offline, songs and sync between two devices, setlists) |

## Develop

Requires PHP 8.3+, Composer, Node 22.18+.

```
composer install && npm install
cp .env.example .env.development      # set DB_DRIVER=sqlite, OWNER_EMAIL, OWNER_PASSWORD
npm run build
composer start                        # http://localhost:8080
```

Checks (all of them before a commit, see `CLAUDE.md`):

```
vendor/bin/phpunit && vendor/bin/phpcs && vendor/bin/phpstan
npm run check
npm run build && npm run e2e
```

When musicos-catolicos changes how a song is parsed, rendered or transposed, regenerate the
golden file and read the diff: `npm run fixtures -- ../musicos-catolicos`.

## API

All JSON, Spanish messages, `Cache-Control: no-store`. Requests that change data must be
`Content-Type: application/json` (CSRF protection) and carry the session cookie.

| Method and path | Answers |
|---|---|
| `GET /api/health` | `200 {status, schema}` |
| `POST /api/login` `{email, password}` | `200 {email}` + cookie · `400` · `401` · `429` |
| `POST /api/logout` | `200 {ok}` and clears the cookie |
| `GET /api/me` | `200 {email}` · `401` |
| `GET /api/sync?since=N` | `200 {songs, setlists, cursor, hasMore}`: songs and setlists changed after change number N (one counter for both), tombstones included · `400` · `401` |
| `POST /api/sync` `{songs?: [{id, title, author, body, updatedAt, deleted}], setlists?: [{id, title, eventDate, notes, items, updatedAt, deleted}]}` | `200 {applied, ignored}`; the newest `updatedAt` (client clock, epoch ms) wins · `400` (nothing stored; `invalid_song` or `invalid_setlist`) · `401` |

A setlist is one record: `items` is a list of at most 80 `{id, part, songId, transpose, note}` (a song in a
part of the Mass, with its key in semitones for that list only) and travels inside it. The whole list is the
unit of the newest-edit-wins rule.

Errors: `{error: "<code>", message: "<texto en español>"}`.

## Documents

- [`DEPLOY.md`](DEPLOY.md): hosting, first deploy, testing on the devices (Spanish).
- [`TODO.md`](TODO.md): what is left.
- [`CLAUDE.md`](CLAUDE.md): working rules for this repository.

## Third-party code

- Atkinson Hyperlegible and Bricolage Grotesque (SIL Open Font License, licenses in `web/fonts/`): the print
  fonts, the same files the public site serves, bundled and served from this origin.
- [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`, Apache-2.0), the legacy build, bundled
  by `scripts/build.ts` and served from this origin: it reads the PDFs of the import screen in the
  browser. The text never leaves the device. Its license banner is kept in the built files.
