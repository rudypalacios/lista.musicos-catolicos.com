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
| `web/src/` | The app: `main.ts` (shell, router), `views/` (list, editor, importer, viewer), `app.ts` (store, sync) |
| `web/src/chordpro/` | ChordPro parser, chords, transposition, lyrics renderer: ports of the public site's PHP and `song.js` |
| `web/src/data/` | Songs on the device (IndexedDB), the queue of unsent songs, the sync engine |
| `web/src/` (others) | `importer.ts` (chords above the words → ChordPro; one song or a whole Mass), `fit.ts` (fit to the screen), `mass.ts` (parts of the Mass), `sw.ts` (service worker) |
| `web/test/` | Unit tests of the client (`node --test`); `fixtures/golden.json` is what the PHP answered |
| `scripts/` | The build, and `fixtures/` that regenerates the golden file from musicos-catolicos |
| `src/` | PHP: `Http/` (actions, middleware), `Auth/`, `Sync/` (songs and their changes), `Database/` |
| `migrations/` | Numbered SQL files, applied by the app on its first request after a deploy |
| `public/` | Web root: `index.php`, `.htaccess`, icons, manifest; the build adds the rest |
| `tests/` | PHPUnit tests, and `e2e/` (Chromium: sign-in and offline, songs and sync between two devices) |

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
| `GET /api/sync?since=N` | `200 {songs, cursor, hasMore}`: songs changed after change number N, tombstones included · `400` · `401` |
| `POST /api/sync` `{songs: [{id, title, author, body, updatedAt, deleted}]}` | `200 {applied, ignored}`; the newest `updatedAt` (client clock, epoch ms) wins · `400` (nothing stored) · `401` |

Errors: `{error: "<code>", message: "<texto en español>"}`.

## Documents

- [`DEPLOY.md`](DEPLOY.md): hosting, first deploy, testing on the devices (Spanish).
- [`TODO.md`](TODO.md): what is left.
- [`CLAUDE.md`](CLAUDE.md): working rules for this repository.
