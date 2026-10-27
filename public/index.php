<?php

declare(strict_types=1);

use App\Auth\Authenticator;
use App\Config;
use App\Database\Connection;
use App\Database\Migrator;
use App\Http\AppFactory;
use Dotenv\Dotenv;

// `php -S` serves existing files (assets, the service worker) by itself
if (PHP_SAPI === 'cli-server' && is_file(__DIR__ . parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH))) {
    return false;
}

$root = dirname(__DIR__);
require $root . '/vendor/autoload.php';

$path = (string) parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Anything that is not the API is the app: the browser router decides what to show, and
// a deep link or a reload must open the shell instead of a 404.
if ($path !== '/api' && !str_starts_with($path, '/api/')) {
    $shell = __DIR__ . '/index.html';
    if (!is_file($shell)) {
        http_response_code(503);
        echo 'La aplicación no está compilada. Ejecuta "npm run build".';
        exit;
    }
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache');
    readfile($shell);
    exit;
}

// .env.development wins over .env, as in musicos-catolicos
$dotenv = Dotenv::createImmutable($root, ['.env.development', '.env'], false);
$dotenv->safeLoad();

$config = Config::fromEnv($_ENV, $root);
$pdo = Connection::create($config);

$migrationsDir = $root . '/migrations';
(new Migrator($pdo, $migrationsDir))->migrate();
(new Authenticator($pdo))->seedOwner($config->ownerEmail, $config->ownerPassword, $config->ownerPasswordHash);

AppFactory::create($pdo, $config, $migrationsDir)->run();
