<?php

declare(strict_types=1);

namespace App\Http;

use App\Auth\Authenticator;
use App\Config;
use App\Database\Migrator;
use App\Http\Actions\HealthAction;
use App\Http\Actions\LoginAction;
use App\Http\Actions\LogoutAction;
use App\Http\Actions\MeAction;
use App\Http\Actions\PullAction;
use App\Http\Actions\PushAction;
use App\Http\Middleware\JsonOnly;
use App\Http\Middleware\RequireUser;
use App\Sync\ChangeFeed;
use App\Sync\SetlistRepository;
use App\Sync\SongRepository;
use PDO;
use Psr\Container\ContainerInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;
use Slim\Exception\HttpException;
use Slim\Factory\AppFactory as SlimFactory;
use Slim\Routing\RouteCollectorProxy;
use Throwable;

/**
 * The JSON API, all under /api. Static files and the app shell are not served from here
 * (public/index.php and .htaccess do that).
 */
final class AppFactory
{
    /**
     * @return App<ContainerInterface|null>
     */
    public static function create(PDO $pdo, Config $config, string $migrationsDir): App
    {
        $authenticator = new Authenticator($pdo);
        $migrator = new Migrator($pdo, $migrationsDir);
        $songs = new SongRepository($pdo);
        $setlists = new SetlistRepository($pdo);
        $feed = new ChangeFeed($songs, $setlists);

        $app = SlimFactory::create();
        $app->addBodyParsingMiddleware();
        $app->addRoutingMiddleware();

        $app->group('/api', function (RouteCollectorProxy $api) use (
            $authenticator,
            $migrator,
            $songs,
            $setlists,
            $feed
        ): void {
            $api->get('/health', new HealthAction($migrator));
            $api->post('/login', new LoginAction($authenticator));
            $api->post('/logout', new LogoutAction($authenticator));
            $api->get('/me', new MeAction())->add(new RequireUser($authenticator));
            $api->get('/sync', new PullAction($feed))->add(new RequireUser($authenticator));
            $api->post('/sync', new PushAction($songs, $setlists))->add(new RequireUser($authenticator));
        })->add(new JsonOnly());

        // Errors answer in JSON; the details only outside production
        $errors = $app->addErrorMiddleware(!$config->isProduction(), true, true);
        $errors->setDefaultErrorHandler(
            static function (
                ServerRequestInterface $request,
                Throwable $e,
                bool $details
            ) use ($app): ResponseInterface {
                $status = $e instanceof HttpException ? $e->getCode() : 500;
                $response = $app->getResponseFactory()->createResponse($status);

                return Json::error(
                    $response,
                    $status,
                    $status === 404 ? 'not_found' : ($status === 405 ? 'method_not_allowed' : 'server_error'),
                    $details ? $e->getMessage() : 'Algo salió mal. Inténtalo de nuevo.'
                );
            }
        );

        return $app;
    }
}
