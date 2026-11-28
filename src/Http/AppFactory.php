<?php

declare(strict_types=1);

namespace App\Http;

use App\Auth\AccountDeletion;
use App\Auth\Accounts;
use App\Auth\Google\GoogleAccounts;
use App\Auth\Google\GoogleOAuth;
use App\Auth\Google\GoogleSignIn;
use App\Auth\Google\HttpGoogleOAuth;
use App\Auth\Google\OAuthStates;
use App\Auth\Authenticator;
use App\Auth\EmailTokens;
use App\Config;
use App\Database\Migrator;
use App\Http\Actions\AccountDeleteConfirmAction;
use App\Http\Actions\AccountDeletePreviewAction;
use App\Http\Actions\AccountDeleteRequestAction;
use App\Http\Actions\AccountKeepAction;
use App\Http\Actions\AuthOptionsAction;
use App\Http\Actions\ChallengeAction;
use App\Http\Actions\ForgotPasswordAction;
use App\Http\Actions\GoogleCallbackAction;
use App\Http\Actions\GoogleStartAction;
use App\Http\Actions\HealthAction;
use App\Http\Actions\LoginAction;
use App\Http\Actions\LogoutAction;
use App\Http\Actions\MeAction;
use App\Http\Actions\PullAction;
use App\Http\Actions\PushAction;
use App\Http\Actions\RegisterAction;
use App\Http\Actions\ResendVerificationAction;
use App\Http\Actions\ResetPasswordAction;
use App\Http\Actions\ShareEnableAction;
use App\Http\Actions\ShareRevokeAction;
use App\Http\Actions\ShareStatusAction;
use App\Http\Actions\SharedViewAction;
use App\Http\Actions\SongShareAction;
use App\Http\Actions\VerifyEmailAction;
use App\Http\Middleware\JsonOnly;
use App\Http\Middleware\PurgeDueAccounts;
use App\Http\Middleware\RequireUser;
use App\Mail\AccountMail;
use App\Mail\LogMailer;
use App\Mail\Mailer;
use App\Mail\SmtpMailer;
use App\Security\ProofOfWork;
use App\Security\RateLimiter;
use App\Security\Secrets;
use App\Share\MissThrottle;
use App\Share\ShareRepository;
use App\Share\SongShareRepository;
use App\Sync\ChangeFeed;
use App\Sync\SetlistRepository;
use App\Sync\TemplateRepository;
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
    public static function create(
        PDO $pdo,
        Config $config,
        string $migrationsDir,
        ?Mailer $mailer = null,
        ?GoogleOAuth $google = null
    ): App {
        $authenticator = new Authenticator($pdo);
        $mailer ??= $config->mail->canSend() ? new SmtpMailer($config->mail) : new LogMailer();
        $accountMail = new AccountMail($mailer, $config->appUrl);
        $accounts = new Accounts($pdo, $authenticator, new EmailTokens($pdo), $accountMail);
        $deletion = new AccountDeletion($pdo, $authenticator, new EmailTokens($pdo), $accountMail);
        // Google is offered only when the owner has set it up (or a test brings its own stand-in)
        $google ??= $config->google->isConfigured()
            ? new HttpGoogleOAuth($config->google, $config->appUrl . '/api/google/callback')
            : null;
        $googleSignIn = $google === null ? null : new GoogleSignIn(
            $google,
            new OAuthStates($pdo),
            new GoogleAccounts($pdo, $authenticator, new EmailTokens($pdo))
        );
        $proof = new ProofOfWork($pdo, new Secrets($pdo));
        $limits = new RateLimiter($pdo);
        $migrator = new Migrator($pdo, $migrationsDir);
        $songs = new SongRepository($pdo);
        $setlists = new SetlistRepository($pdo);
        $templates = new TemplateRepository($pdo);
        $feed = new ChangeFeed($songs, $setlists, $templates);
        $shares = new ShareRepository($pdo);
        $songShares = new SongShareRepository($pdo);
        $misses = new MissThrottle($pdo);

        $app = SlimFactory::create();
        $app->addBodyParsingMiddleware();
        $app->addRoutingMiddleware();

        $app->group('/api', function (RouteCollectorProxy $api) use (
            $authenticator,
            $migrator,
            $songs,
            $setlists,
            $templates,
            $feed,
            $shares,
            $songShares,
            $misses,
            $accounts,
            $proof,
            $limits,
            $googleSignIn,
            $config,
            $deletion
        ): void {
            $api->get('/health', new HealthAction($migrator));
            $api->post('/login', new LoginAction($authenticator));
            $api->post('/logout', new LogoutAction($authenticator));

            // Accounts of other people: sign up, confirm the address, forget the password
            $api->get('/challenge', new ChallengeAction($proof));
            $api->post('/register', new RegisterAction($accounts, $proof, $limits));
            $api->post('/verify-email', new VerifyEmailAction($accounts));
            $api->post('/verify-email/resend', new ResendVerificationAction($accounts, $limits))
                ->add(new RequireUser($authenticator));
            $api->post('/forgot', new ForgotPasswordAction($accounts, $proof, $limits));
            $api->post('/reset', new ResetPasswordAction($accounts));

            // Signing in with Google: the browser is sent there and comes back (pages it follows, not calls of the app)
            $api->get('/auth-options', new AuthOptionsAction($googleSignIn !== null));
            $api->get('/google/start', new GoogleStartAction($googleSignIn, $limits, $config->appUrl));
            $api->get('/google/callback', new GoogleCallbackAction($googleSignIn, $limits, $config->appUrl));

            // Deleting the account: a link by email, 3 days to change one's mind, then it is deleted (AccountDeletion)
            $api->post('/account/delete-request', new AccountDeleteRequestAction($deletion, $limits))
                ->add(new RequireUser($authenticator));
            $api->post('/account/delete-preview', new AccountDeletePreviewAction($deletion));
            $api->post('/account/delete-confirm', new AccountDeleteConfirmAction($deletion));
            $api->post('/account/keep', new AccountKeepAction($deletion))->add(new RequireUser($authenticator, true));

            $api->get('/me', new MeAction())->add(new RequireUser($authenticator, true));
            $api->get('/sync', new PullAction($feed))->add(new RequireUser($authenticator));
            $api->post('/sync', new PushAction($songs, $setlists, $templates))->add(new RequireUser($authenticator));

            // Sharing a list by a link (the person's side, with a session) and reading what a link shows (anyone's)
            $api->get('/lists/{id}/share', new ShareStatusAction($shares))->add(new RequireUser($authenticator));
            $api->put('/lists/{id}/share', new ShareEnableAction($shares))->add(new RequireUser($authenticator));
            $api->delete('/lists/{id}/share', new ShareRevokeAction($shares))->add(new RequireUser($authenticator));
            $api->get('/shared/{code}', new SharedViewAction($shares, $songShares, $misses));

            // The same for one song
            $song = new SongShareAction($songShares);
            $api->get('/songs/{id}/share', [$song, 'status'])->add(new RequireUser($authenticator));
            $api->put('/songs/{id}/share', [$song, 'enable'])->add(new RequireUser($authenticator));
            $api->delete('/songs/{id}/share', [$song, 'revoke'])->add(new RequireUser($authenticator));
        })->add(new JsonOnly())->add(new PurgeDueAccounts($deletion));

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
