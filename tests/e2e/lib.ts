/** What the e2e scripts share: the real PHP server on a throwaway SQLite database, and a few helpers */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer, type Server as NetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, Page } from 'playwright';

// Playwright is installed globally in the dev container, not in package.json (it would
// download browsers on every install). CommonJS resolution honours NODE_PATH; import does not.
export const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

export const EMAIL = 'owner@example.com';
export const PASSWORD = 'correct horse battery';

export interface Server {
    base: string;
    stop(): void;
}

/** What the server of a test is started with */
export interface ServerOptions {
    /** Anyone can create an account (SIGNUP_OPEN=1) */
    signupOpen?: boolean;
    /** The port of a `startMailSink`: the server sends its emails there, over real SMTP */
    mailPort?: number;
}

export async function startServer(port: number, options: ServerOptions = {}): Promise<Server> {
    const base = `http://127.0.0.1:${port}`;
    const dir = mkdtempSync(join(tmpdir(), 'lista-e2e-'));
    const child: ChildProcess = spawn(
        'php',
        ['-d', 'variables_order=EGPCS', '-S', `127.0.0.1:${port}`, '-t', 'public', 'public/index.php'],
        {
            env: {
                ...process.env,
                APP_ENV: 'development',
                DB_DRIVER: 'sqlite',
                DB_PATH: join(dir, 'e2e.sqlite'),
                OWNER_EMAIL: EMAIL,
                OWNER_PASSWORD: PASSWORD,
                APP_URL: base,
                ...(options.signupOpen === true ? { SIGNUP_OPEN: '1' } : {}),
                ...(options.mailPort === undefined ? {} : { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(options.mailPort), SMTP_SECURE: 'none' }),
            },
            stdio: 'ignore',
        },
    );
    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            if ((await fetch(`${base}/api/health`)).ok) {
                return {
                    base,
                    stop: () => {
                        child.kill();
                        rmSync(dir, { recursive: true, force: true });
                    },
                };
            }
        } catch {
            // not listening yet
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    child.kill();
    throw new Error('The PHP server did not start');
}

/** The emails the server of a test sent: its own little SMTP server, so they travel the real way (PHPMailer, the protocol) */
export interface MailSink {
    /** Everything that arrived, oldest first: who it was for and the text */
    messages: { to: string; text: string }[];
    /** The link of the newest message to `to` that has `path` in it (`/verificar/`, `/restablecer/`), or null */
    linkTo(to: string, path: string): string | null;
    stop(): void;
}

export function startMailSink(port: number): Promise<MailSink> {
    const messages: MailSink['messages'] = [];
    const server: NetServer = createServer((socket) => {
        socket.setEncoding('utf8');
        let buffer = '';
        let data = false;
        let to = '';
        let text: string[] = [];
        const reply = (line: string): void => void socket.write(`${line}\r\n`);
        reply('220 sink ESMTP');
        socket.on('data', (chunk: string) => {
            buffer += chunk;
            for (let end = buffer.indexOf('\r\n'); end >= 0; end = buffer.indexOf('\r\n')) {
                const line = buffer.slice(0, end);
                buffer = buffer.slice(end + 2);
                if (data) {
                    if (line === '.') {
                        data = false;
                        messages.push({ to, text: text.join('\n') });
                        text = [];
                        reply('250 OK queued');
                    } else {
                        text.push(line);
                    }
                    continue;
                }
                const command = line.toUpperCase();
                if (command.startsWith('RCPT')) {
                    to = /<([^>]+)>/.exec(line)?.[1] ?? '';
                    reply('250 OK');
                } else if (command.startsWith('DATA')) {
                    data = true;
                    reply('354 go');
                } else if (command.startsWith('QUIT')) {
                    reply('221 bye');
                    socket.end();
                } else if (command.startsWith('EHLO') || command.startsWith('HELO')) {
                    reply('250 sink');
                } else {
                    reply('250 OK');
                }
            }
        });
        socket.on('error', () => undefined);
    });

    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => resolve({
            messages,
            linkTo: (to, path) => {
                for (const message of [...messages].reverse()) {
                    const found = message.to === to ? new RegExp(`https?://\\S+${path}[0-9a-f]{64}`).exec(message.text) : null;
                    if (found !== null) {
                        return found[0];
                    }
                }

                return null;
            },
            stop: () => server.close(),
        }));
    });
}

export function reporter(): { pass(name: string): void; count(): number } {
    let n = 0;

    return {
        pass(name) {
            n++;
            console.log('  ok  ' + name);
        },
        count: () => n,
    };
}

export async function signIn(page: Page, base: string): Promise<void> {
    await page.goto(base + '/');
    // A device with nothing on it and no session opens on the welcome: the app is not behind a login
    await page.getByRole('button', { name: 'Ya tengo cuenta' }).click();
    await page.getByRole('heading', { name: 'Inicia sesión' }).waitFor();
    await page.getByLabel('Correo').fill(EMAIL);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByRole('heading', { name: 'Cantos' }).waitFor();
}

/** The menu: at the bottom of a phone, at the left of a wide screen */
const menu = (page: Page) => page.getByRole('navigation', { name: 'Menú' });

/**
 * Goes to a screen of the menu by its entry. On a phone the menu is only on the screens of the menu
 * itself: a screen that hangs from another (a song, a list) has only the way back, so this goes back
 * until the menu is there, as a person does.
 */
export async function openSection(page: Page, name: 'Cantos' | 'Listados' | 'Ajustes'): Promise<void> {
    const entry = menu(page).getByRole('link', { name, exact: true });
    for (let hops = 0; hops < 4 && !(await entry.isVisible()); hops++) {
        await page.locator('.bar__back').click();
    }
    await entry.click();
}

/**
 * "＋ Nuevo" on the lists screen asks which template (the sections the list starts with): this makes a list from the
 * one named, the Misa by default, and waits until it is open.
 */
export async function newList(page: Page, template = 'Misa'): Promise<void> {
    await page.getByRole('button', { name: 'Nuevo listado' }).click();
    await page.locator('.sheet-layer.is-open .sheet-action', { hasText: template }).first().click();
}

/** The song page's "⋯": opens the sheet with how the lyrics are drawn, printing, editing and deleting */
export async function openSongMenu(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Más opciones', exact: true }).click();
    await page.getByRole('button', { name: 'Editar letra y acordes' }).waitFor();
}

/** From the song page: "⋯", then "Editar letra y acordes" */
export async function editFromSongPage(page: Page): Promise<void> {
    await openSongMenu(page);
    await page.getByRole('button', { name: 'Editar letra y acordes' }).click();
}

/** Signs out the way a person does: Ajustes, then "Salir" */
export async function signOutFromSettings(page: Page): Promise<void> {
    await openSection(page, 'Ajustes');
    await page.getByRole('button', { name: 'Salir' }).click();
}

/** Waits until the header says the songs are synced (nothing left to send) */
export async function synced(page: Page): Promise<void> {
    await page.waitForFunction(() => document.querySelector('.sync')?.textContent === 'Sincronizado', undefined, { timeout: 15000 });
}

/** The Content-Security-Policy that public/.htaccess sends in production */
export function contentSecurityPolicy(): string {
    const htaccess = readFileSync(new URL('../../public/.htaccess', import.meta.url), 'utf8');
    const match = /Content-Security-Policy "([^"]+)"/.exec(htaccess);
    if (match?.[1] === undefined) {
        throw new Error('public/.htaccess has no Content-Security-Policy');
    }

    return match[1];
}

/**
 * Makes every response carry the production policy, as Apache does, so a script, a style, an
 * eval or a worker that the policy forbids fails here and not only on the host. The built-in PHP
 * server sends no such header, and the service worker would hide it, so use it with
 * `serviceWorkers: 'block'`. Returns the policy violations the page reports.
 */
export async function enforcePolicy(context: BrowserContext, page: Page): Promise<string[]> {
    const policy = contentSecurityPolicy();
    await context.route('**/*', async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
    });
    const violations: string[] = [];
    page.on('console', (message) => {
        if (/content security policy/i.test(message.text())) {
            violations.push(message.text());
        }
    });

    return violations;
}
