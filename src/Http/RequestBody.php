<?php

declare(strict_types=1);

namespace App\Http;

use Psr\Http\Message\ServerRequestInterface;

/** What an action reads from a JSON body, without trusting its shape */
final class RequestBody
{
    /** The field as a string, or null when it is missing or is not one */
    public static function string(ServerRequestInterface $request, string $field): ?string
    {
        $body = $request->getParsedBody();
        $value = is_array($body) ? ($body[$field] ?? null) : null;

        return is_string($value) ? $value : null;
    }

    /**
     * The proof of work the browser solved: `{pow: {challenge, nonce}}`.
     *
     * @return array{challenge: string, nonce: string}|null
     */
    public static function proof(ServerRequestInterface $request): ?array
    {
        $body = $request->getParsedBody();
        $pow = is_array($body) ? ($body['pow'] ?? null) : null;
        if (!is_array($pow) || !is_string($pow['challenge'] ?? null) || !is_string($pow['nonce'] ?? null)) {
            return null;
        }

        return ['challenge' => $pow['challenge'], 'nonce' => $pow['nonce']];
    }

    public static function ip(ServerRequestInterface $request): string
    {
        return (string) ($request->getServerParams()['REMOTE_ADDR'] ?? 'unknown');
    }

    /** Epoch milliseconds: the clock every record of the app is stamped with */
    public static function now(): int
    {
        return (int) (microtime(true) * 1000);
    }
}
