<?php

declare(strict_types=1);

namespace App\Http\Actions;

use App\Auth\TooManyAttemptsException;
use App\Http\Json;
use App\Share\MissThrottle;
use App\Share\ShareRepository;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * GET /api/shared/{code} → 200 the list a link shows, for anyone: no session, no cookie. This is the only public
 * endpoint that reads the person's data, so it says as little as it can (see ShareRepository::view), answers a link
 * that was stopped, never given or malformed with the same 404 (nobody learns which), and slows down an address that
 * keeps asking for links that do not exist.
 *
 * The answer may be kept by the browser and by anything in between for a minute, with an ETag after that, so a
 * crowd opening the same link (a Sunday before Mass) reads it once, not once each.
 */
final class SharedViewAction
{
    private const CACHE_SECONDS = 60;

    public function __construct(private readonly ShareRepository $shares, private readonly MissThrottle $throttle)
    {
    }

    /** @param array<string, string> $args */
    public function __invoke(
        ServerRequestInterface $request,
        ResponseInterface $response,
        array $args
    ): ResponseInterface {
        $ip = (string) ($request->getServerParams()['REMOTE_ADDR'] ?? 'unknown');
        try {
            $this->throttle->assertAllowed($ip);
        } catch (TooManyAttemptsException) {
            return Json::error($response, 429, 'too_many_requests', 'Demasiados intentos. Espera unos minutos.');
        }

        $code = $args['code'] ?? '';
        $view = preg_match('~^[0-9a-f]{32}$~', $code) === 1 ? $this->shares->view($code) : null;
        if ($view === null) {
            $this->throttle->record($ip);

            return Json::error($response, 404, 'not_found', 'Este enlace ya no existe.');
        }

        $json = (string) json_encode($view, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $etag = '"' . substr(hash('sha256', $json), 0, 32) . '"';
        $headers = [
            'ETag' => $etag,
            'Cache-Control' => 'public, max-age=' . self::CACHE_SECONDS,
            'X-Robots-Tag' => 'noindex, nofollow',
        ];
        if ($request->getHeaderLine('If-None-Match') === $etag) {
            foreach ($headers as $name => $value) {
                $response = $response->withHeader($name, $value);
            }

            return $response->withStatus(304);
        }

        $response->getBody()->write($json);
        $response = $response->withHeader('Content-Type', 'application/json; charset=utf-8');
        foreach ($headers as $name => $value) {
            $response = $response->withHeader($name, $value);
        }

        return $response;
    }
}
