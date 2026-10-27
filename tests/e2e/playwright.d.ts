// Only what offline.ts uses. The real package lives in the dev container, not in package.json
// (installing it downloads browsers), so there are no bundled types to rely on.
declare module 'playwright' {
    interface Locator {
        click(): Promise<void>;
        fill(value: string): Promise<void>;
        first(): Locator;
        waitFor(): Promise<void>;
    }
    interface Page {
        evaluate<T>(callback: () => T | Promise<T>): Promise<T>;
        getByLabel(text: string): Locator;
        getByRole(role: string, options: { name: string }): Locator;
        getByText(text: string): Locator;
        goto(url: string): Promise<unknown>;
        on(event: 'pageerror', listener: (error: Error) => void): void;
        reload(): Promise<unknown>;
    }
    interface BrowserContext {
        newPage(): Promise<Page>;
        setOffline(offline: boolean): Promise<void>;
    }
    interface Browser {
        close(): Promise<void>;
        newContext(options: { viewport: { width: number; height: number } }): Promise<BrowserContext>;
    }
    export const chromium: { launch(): Promise<Browser> };
}
