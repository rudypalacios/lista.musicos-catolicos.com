<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Http\Json;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Response;

/**
 * Requests that change data must be JSON. A page on another site cannot send
 * "Content-Type: application/json" without the browser first asking this server for
 * permission (CORS), which it never gives: that is the CSRF protection, on top of SameSite.
 */
final class JsonOnly implements MiddlewareInterface
{
    private const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if (
            !in_array($request->getMethod(), self::SAFE_METHODS, true)
            && stripos($request->getHeaderLine('Content-Type'), 'application/json') !== 0
        ) {
            return Json::error(new Response(), 415, 'unsupported_media_type', 'La petición debe ser JSON.');
        }

        return $handler->handle($request);
    }
}
