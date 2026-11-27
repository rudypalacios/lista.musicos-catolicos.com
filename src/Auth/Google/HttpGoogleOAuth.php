<?php

declare(strict_types=1);

namespace App\Auth\Google;

use App\GoogleConfig;

/**
 * Google over HTTPS (OAuth 2.0 authorization code with PKCE). Only `openid email` is asked: the name, the photo and the
 * rest of the profile are not needed and are not requested.
 */
final class HttpGoogleOAuth implements GoogleOAuth
{
    private const TIMEOUT_SECONDS = 10;

    public function __construct(private readonly GoogleConfig $config, private readonly string $redirectUri)
    {
    }

    public function authorizationUrl(string $state, string $nonce, string $challenge): string
    {
        return $this->config->authUrl . '?' . http_build_query([
            'client_id' => $this->config->clientId,
            'redirect_uri' => $this->redirectUri,
            'response_type' => 'code',
            'scope' => 'openid email',
            'state' => $state,
            'nonce' => $nonce,
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
            // Always ask which account: a tablet in a parish is shared, and the last one used is not necessarily the person
            'prompt' => 'select_account',
        ], '', '&', PHP_QUERY_RFC3986);
    }

    public function identify(string $code, string $verifier, string $nonce, int $nowSeconds): GoogleIdentity
    {
        $clientId = (string) $this->config->clientId;
        $answer = $this->post([
            'code' => $code,
            'client_id' => $clientId,
            'client_secret' => (string) $this->config->clientSecret,
            'redirect_uri' => $this->redirectUri,
            'grant_type' => 'authorization_code',
            'code_verifier' => $verifier,
        ]);
        $token = $answer['id_token'] ?? null;
        if (!is_string($token)) {
            throw new GoogleFailed('Google answered with no ID token');
        }
        $parts = explode('.', $token);
        $payload = count($parts) === 3 ? base64_decode(strtr($parts[1], '-_', '+/'), true) : false;
        $claims = $payload === false ? null : json_decode($payload, true);
        if (!is_array($claims)) {
            throw new GoogleFailed('The ID token could not be read');
        }

        return GoogleIdentity::fromClaims($claims, $clientId, $nonce, $nowSeconds);
    }

    /**
     * @param array<string, string> $fields
     *
     * @return array<string, mixed>
     *
     * @throws GoogleFailed
     */
    private function post(array $fields): array
    {
        if (!function_exists('curl_init')) {
            throw new GoogleFailed('The curl extension is not installed');
        }
        $curl = curl_init($this->config->tokenUrl);
        if ($curl === false) {
            throw new GoogleFailed('Could not start the request to Google');
        }
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($fields),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => self::TIMEOUT_SECONDS,
            CURLOPT_TIMEOUT => self::TIMEOUT_SECONDS,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);
        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);

        if (!is_string($body)) {
            throw new GoogleFailed('Google did not answer: ' . $error);
        }
        $data = json_decode($body, true);
        if ($status !== 200 || !is_array($data)) {
            // Google's own reason (invalid_grant, ...) helps to find out why; the code and the secret are never in it
            $reason = is_array($data) && is_string($data['error'] ?? null) ? $data['error'] : 'no reason given';
            throw new GoogleFailed('Google refused the code (' . $status . '): ' . $reason);
        }

        return $data;
    }
}
