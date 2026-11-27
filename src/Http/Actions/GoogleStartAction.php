<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\Google\GoogleSignIn;
use App\Http\GoogleReturn;
use App\Http\OAuthCookie;
use App\Http\RequestBody;
use App\Security\RateLimiter;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * GET /api/google/start → 302 to Google's page, with the cookie that ties the return to this browser. It is a page the
 * browser is sent to, not a call of the app: that is why it is a GET, and why its failures are a 302 to the app with a word
 * (`unavailable` when the owner has not set Google up, `busy` after too many starts from one address).
 */
final class GoogleStartAction
{
    /** Starts one address may make in an hour: a family on one network is not locked out, a script is */
    public const MAX_PER_HOUR = 20;

    public function __construct(
        private readonly ?GoogleSignIn $signIn,
        private readonly RateLimiter $limits,
        private readonly string $appUrl,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        if ($this->signIn === null) {
            return GoogleReturn::to($response, $this->appUrl, 'unavailable');
        }
        $now = RequestBody::now();
        $ip = RequestBody::ip($request);
        if (!$this->limits->allows('google-start', $ip, self::MAX_PER_HOUR, 3600, $now)) {
            return GoogleReturn::to($response, $this->appUrl, 'busy');
        }
        $this->limits->hit('google-start', $ip, $now);

        $started = $this->signIn->begin($now);

        $toGoogle = $response
            ->withStatus(302)
            ->withHeader('Location', $started['url'])
            ->withHeader('Cache-Control', 'no-store');

        return OAuthCookie::set($toGoogle, $request, $started['binding']);
    }
}
