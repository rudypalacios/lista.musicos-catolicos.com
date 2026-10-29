/** What the e2e scripts share: the real PHP server on a throwaway SQLite database, and a few helpers */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
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

export async function startServer(port: number): Promise<Server> {
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
            },
            stdio: 'ignore',
        },
    );
    const base = `http://127.0.0.1:${port}`;
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
    await page.getByRole('heading', { name: 'Inicia sesión' }).waitFor();
    await page.getByLabel('Correo').fill(EMAIL);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByRole('heading', { name: 'Cantos' }).waitFor();
}

/**
 * Goes to a section by its tab. A screen that hangs from another (a song, a list) has no tabs, only
 * the way back, so this goes back until the tabs are there, as a person does.
 */
export async function openSection(page: Page, name: 'Cantos' | 'Listados'): Promise<void> {
    const tab = page.getByRole('link', { name, exact: true });
    for (let hops = 0; hops < 4 && !(await tab.isVisible()); hops++) {
        await page.locator('.bar__back').click();
    }
    await tab.click();
}

/** Opens the account menu of the header (the avatar) and picks one of its entries */
export async function accountMenu(page: Page, entry: 'Ajustes' | 'Cómo instalar la app' | 'Salir'): Promise<void> {
    await page.getByRole('button', { name: /^Cuenta de / }).click();
    const menu = page.getByRole('dialog', { name: 'Cuenta' });
    await menu.getByRole(entry === 'Salir' ? 'button' : 'link', { name: entry }).click();
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
