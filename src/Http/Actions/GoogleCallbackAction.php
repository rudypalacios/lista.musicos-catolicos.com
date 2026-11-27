<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\Google\GoogleFailed;
use App\Auth\Google\GoogleSignIn;
use App\Http\GoogleReturn;
use App\Http\OAuthCookie;
use App\Http\RequestBody;
use App\Http\SessionCookie;
use App\Security\RateLimiter;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Throwable;

/**
 * GET /api/google/callback?code=…&state=… → 302 to the app, with the session cookie when it worked. Google sends the browser
 * here. Whatever happens, the person ends on the app's front page with a word that says how it went: `ok`, `new` (an account
 * was made), `cancelled` (they said no to Google), `unverified`, `busy`, `unavailable` or `failed`. The code and the state are
 * never written to the log.
 */
final class GoogleCallbackAction
{
    /** Returns one address may make in an hour */
    public const MAX_PER_HOUR = 30;

    public function __construct(
        private readonly ?GoogleSignIn $signIn,
        private readonly RateLimiter $limits,
        private readonly string $appUrl,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        // The cookie served its purpose whatever comes next: it never stays
        $to = fn (string $outcome): ResponseInterface => OAuthCookie::clear(
            GoogleReturn::to($response, $this->appUrl, $outcome),
            $request
        );

        if ($this->signIn === null) {
            return $to('unavailable');
        }
        $now = RequestBody::now();
        $ip = RequestBody::ip($request);
        if (!$this->limits->allows('google-return', $ip, self::MAX_PER_HOUR, 3600, $now)) {
            return $to('busy');
        }
        $this->limits->hit('google-return', $ip, $now);

        $query = $request->getQueryParams();
        if (($query['error'] ?? null) === 'access_denied') {
            return $to('cancelled');
        }
        $code = $query['code'] ?? null;
        $state = $query['state'] ?? null;
        $binding = OAuthCookie::read($request);
        if (!is_string($code) || $code === '' || !is_string($state) || $binding === null) {
            return $to('failed');
        }

        try {
            $account = $this->signIn->finish($state, $binding, $code, $now);
        } catch (GoogleFailed $e) {
            error_log('Google sign-in: ' . $e->getMessage());

            return $to($e->reason);
        } catch (Throwable $e) {
            error_log('Google sign-in: ' . $e::class . ': ' . $e->getMessage());

            return $to(GoogleFailed::FAILED);
        }

        return SessionCookie::set($to($account['created'] ? 'new' : 'ok'), $request, $account['sessionToken']);
    }
}
