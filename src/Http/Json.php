<?php

declare(strict_types=1);

namespace App\Http;

use Psr\Http\Message\ResponseInterface;

final class Json
{
    /**
     * @param array<string, mixed> $data
     */
    public static function respond(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        return $response
            ->withStatus($status)
            ->withHeader('Content-Type', 'application/json; charset=utf-8')
            ->withHeader('Cache-Control', 'no-store');
    }

    /** A machine-readable error code plus a Spanish message the app can show as is */
    public static function error(
        ResponseInterface $response,
        int $status,
        string $code,
        string $message
    ): ResponseInterface {
        return self::respond($response, ['error' => $code, 'message' => $message], $status);
    }
}
