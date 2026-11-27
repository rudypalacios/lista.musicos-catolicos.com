/**
 * A stand-in for Google's two addresses (the page where the person chooses an account, and the token endpoint), so the real
 * server can be tried end to end: it checks what Google would check (the client, its secret, the redirect address and the PKCE
 * proof of the code) and answers the way Google does. What it says the next person is, a test sets in `next`.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';

export const GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
export const GOOGLE_CLIENT_SECRET = 'test-secret';

/** Who the next sign-in will be, or that the person says no */
export type Next = { sub: string; email: string; verified?: boolean } | 'deny';

export interface FakeGoogle {
    authUrl: string;
    tokenUrl: string;
    /** Set before the browser is sent to Google */
    next: Next;
    /** The query of the last visit to the page where the person chooses */
    lastAuth: URLSearchParams | null;
    /** Codes traded for a token, and refusals (a wrong secret, a proof that does not match, a code used twice) */
    exchanged: number;
    refused: string[];
    stop(): void;
}

interface Issued {
    nonce: string;
    challenge: string;
    redirect: string;
    who: Exclude<Next, 'deny'>;
}

const base64url = (data: Buffer): string => data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
        let body = '';
        request.on('data', (chunk: Buffer) => (body += chunk.toString()));
        request.on('end', () => resolve(body));
    });
}

export function startFakeGoogle(port: number): Promise<FakeGoogle> {
    const issued = new Map<string, Issued>();
    const fake: FakeGoogle = {
        authUrl: `http://127.0.0.1:${port}/auth`,
        tokenUrl: `http://127.0.0.1:${port}/token`,
        next: 'deny',
        lastAuth: null,
        exchanged: 0,
        refused: [],
        stop: () => undefined,
    };

    const server: Server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
        if (request.method === 'GET' && url.pathname === '/auth') {
            const query = url.searchParams;
            fake.lastAuth = query;
            const redirect = query.get('redirect_uri') ?? '';
            const state = query.get('state') ?? '';
            if (query.get('client_id') !== GOOGLE_CLIENT_ID || redirect === '' || state === '') {
                response.writeHead(400).end('bad request');

                return;
            }
            if (fake.next === 'deny') {
                response.writeHead(302, { Location: `${redirect}?error=access_denied&state=${state}` }).end();

                return;
            }
            const code = randomBytes(16).toString('hex');
            issued.set(code, {
                nonce: query.get('nonce') ?? '',
                challenge: query.get('code_challenge') ?? '',
                redirect,
                who: fake.next,
            });
            response.writeHead(302, { Location: `${redirect}?code=${code}&state=${state}` }).end();

            return;
        }
        if (request.method === 'POST' && url.pathname === '/token') {
            void readBody(request).then((raw) => {
                const form = new URLSearchParams(raw);
                const refuse = (why: string): void => {
                    fake.refused.push(why);
                    response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'invalid_grant' }));
                };
                const code = form.get('code') ?? '';
                const found = issued.get(code);
                issued.delete(code);
                if (found === undefined) {
                    return refuse('unknown or used code');
                }
                if (form.get('client_id') !== GOOGLE_CLIENT_ID || form.get('client_secret') !== GOOGLE_CLIENT_SECRET) {
                    return refuse('wrong client or secret');
                }
                if (form.get('grant_type') !== 'authorization_code' || form.get('redirect_uri') !== found.redirect) {
                    return refuse('wrong grant or redirect');
                }
                if (base64url(createHash('sha256').update(form.get('code_verifier') ?? '').digest()) !== found.challenge) {
                    return refuse('the PKCE proof does not match');
                }
                fake.exchanged++;
                const part = (value: object): string => base64url(Buffer.from(JSON.stringify(value)));
                const claims = {
                    iss: 'https://accounts.google.com',
                    aud: GOOGLE_CLIENT_ID,
                    sub: found.who.sub,
                    email: found.who.email,
                    email_verified: found.who.verified ?? true,
                    nonce: found.nonce,
                    iat: Math.floor(Date.now() / 1000),
                    exp: Math.floor(Date.now() / 1000) + 3600,
                };
                const idToken = `${part({ alg: 'RS256', typ: 'JWT' })}.${part(claims)}.signature`;
                response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id_token: idToken, access_token: 'unused' }));
            });

            return;
        }
        response.writeHead(404).end();
    });

    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => {
            // The handlers read `fake` itself, so it is the one handed out (a copy would not see what a test sets)
            fake.stop = () => void server.close();
            resolve(fake);
        });
    });
}
