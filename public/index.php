<?php

declare(strict_types=1);

use App\Auth\Authenticator;
use App\Config;
use App\Database\Connection;
use App\Database\Migrator;
use App\Http\AppFactory;
use App\Http\ShellPage;
use App\Share\MissThrottle;
use App\Share\SharePreview;
use App\Share\ShareRepository;
use App\Share\SongShareRepository;
use Dotenv\Dotenv;

// `php -S` serves existing files (assets, the service worker) by itself
if (PHP_SAPI === 'cli-server' && is_file(__DIR__ . parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH))) {
    return false;
}

$root = dirname(__DIR__);
require $root . '/vendor/autoload.php';

$path = (string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH);

/**
 * Opens the database the way the API does (the config, then the migrations), for what the shell page also needs.
 *
 * @return array{0: Config, 1: \PDO, 2: string}
 */
$boot = static function () use ($root): array {
    // .env.development wins over .env, as in musicos-catolicos
    Dotenv::createImmutable($root, ['.env.development', '.env'], false)->safeLoad();
    $config = Config::fromEnv($_ENV, $root);
    $pdo = Connection::create($config);
    $migrationsDir = $root . '/migrations';
    (new Migrator($pdo, $migrationsDir))->migrate();

    return [$config, $pdo, $migrationsDir];
};

// Anything that is not the API is the app: the browser router decides what to show, and
// a deep link or a reload must open the shell instead of a 404.
if ($path !== '/api' && !str_starts_with($path, '/api/')) {
    $shell = __DIR__ . '/index.html';
    if (!is_file($shell)) {
        http_response_code(503);
        echo 'La aplicación no está compilada. Ejecuta "npm run build".';
        exit;
    }
    $page = (string) file_get_contents($shell);

    // A link to a shared list or song carries its name in the page, for the preview a chat app draws when it is pasted.
    // The preview is a courtesy: if it cannot be made the page is the same one every other address gets.
    if (preg_match('~^/c/([0-9a-f]{32})(?:/\d{1,3})?/?$~', $path, $link) === 1) {
        try {
            [, $pdo] = $boot();
            $previews = new SharePreview(
                new ShareRepository($pdo),
                new SongShareRepository($pdo),
                new MissThrottle($pdo)
            );
            $preview = $previews->of($link[1], (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
            if ($preview !== null) {
                $page = ShellPage::withPreview($page, $preview['kind'], $preview['title']);
            }
        } catch (Throwable $e) {
            error_log('Link preview not made: ' . $e->getMessage());
        }
    }

    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache');
    echo $page;
    exit;
}

[$config, $pdo, $migrationsDir] = $boot();
(new Authenticator($pdo))->seedOwner($config->ownerEmail, $config->ownerPassword, $config->ownerPasswordHash);

AppFactory::create($pdo, $config, $migrationsDir)->run();
