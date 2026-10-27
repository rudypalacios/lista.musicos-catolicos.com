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
| `web/src/` | The app (`main.ts`), the service worker (`sw.ts`) and its routing rules |
| `web/test/` | Unit tests of the client (`node --test`) |
| `scripts/` | The build: bundles, hashes, writes `index.html` and `sw.js` into `public/` |
| `src/` | PHP: `Http/` (actions, middleware), `Auth/`, `Database/` (connection, migrator) |
| `migrations/` | Numbered SQL files, applied by the app on its first request after a deploy |
| `public/` | Web root: `index.php`, `.htaccess`, icons, manifest; the build adds the rest |
| `tests/` | PHPUnit tests, and `e2e/offline.ts` (Chromium) |

## Develop

Requires PHP 8.1+, Composer, Node 22.18+.

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
npm run e2e
```

## API

All JSON, Spanish messages, `Cache-Control: no-store`. Requests that change data must be
`Content-Type: application/json` (CSRF protection) and carry the session cookie.

| Method and path | Answers |
|---|---|
| `GET /api/health` | `200 {status, schema}` |
| `POST /api/login` `{email, password}` | `200 {email}` + cookie · `400` · `401` · `429` |
| `POST /api/logout` | `200 {ok}` and clears the cookie |
| `GET /api/me` | `200 {email}` · `401` |

Errors: `{error: "<code>", message: "<texto en español>"}`.

## Documents

- [`DEPLOY.md`](DEPLOY.md): hosting, first deploy, testing on the devices (Spanish).
- [`TODO.md`](TODO.md): what is left.
- [`CLAUDE.md`](CLAUDE.md): working rules for this repository.
