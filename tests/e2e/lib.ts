/** What the e2e scripts share: the real PHP server on a throwaway SQLite database, and a few helpers */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright';

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

/** Waits until the header says the songs are synced (nothing left to send) */
export async function synced(page: Page): Promise<void> {
    await page.waitForFunction(() => document.querySelector('.sync')?.textContent === 'Sincronizado', { timeout: 15000 });
}
