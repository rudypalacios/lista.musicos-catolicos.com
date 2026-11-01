// Only what the e2e scripts use. The real package lives in the dev container, not in package.json
// (installing it downloads browsers), so there are no bundled types to rely on.
declare module 'playwright' {
    interface LocatorOptions {
        has?: Locator;
        hasText?: string | RegExp;
    }
    interface Locator {
        click(options?: { force?: boolean }): Promise<void>;
        tap(): Promise<void>;
        check(): Promise<void>;
        uncheck(): Promise<void>;
        isChecked(): Promise<boolean>;
        fill(value: string): Promise<void>;
        blur(): Promise<void>;
        first(): Locator;
        filter(options: { hasText?: string | RegExp }): Locator;
        nth(index: number): Locator;
        boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
        waitFor(options?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number }): Promise<void>;
        textContent(): Promise<string | null>;
        inputValue(): Promise<string>;
        getAttribute(name: string): Promise<string | null>;
        count(): Promise<number>;
        isVisible(): Promise<boolean>;
        isDisabled(): Promise<boolean>;
        innerText(): Promise<string>;
        allTextContents(): Promise<string[]>;
        locator(selector: string, options?: LocatorOptions): Locator;
        getByLabel(text: string, options?: { exact?: boolean }): Locator;
        getByRole(role: string, options?: { name?: string | RegExp; exact?: boolean }): Locator;
        getByText(text: string | RegExp, options?: { exact?: boolean }): Locator;
        press(key: string): Promise<void>;
        evaluate<T>(callback: (element: HTMLElement) => T): Promise<T>;
        setInputFiles(path: string): Promise<void>;
    }
    interface ConsoleMessage {
        type(): string;
        text(): string;
    }
    interface ApiResponse {
        headers(): Record<string, string>;
    }
    interface Route {
        fetch(): Promise<ApiResponse>;
        fulfill(options: { response: ApiResponse; headers?: Record<string, string> }): Promise<void>;
    }
    interface Dialog {
        message(): string;
        accept(): Promise<void>;
        dismiss(): Promise<void>;
    }
    interface Page {
        evaluate<T>(callback: () => T | Promise<T>): Promise<T>;
        evaluate<T, A>(callback: (argument: A) => T | Promise<T>, argument: A): Promise<T>;
        setContent(html: string): Promise<void>;
        addStyleTag(options: { content: string }): Promise<unknown>;
        screenshot(options?: { type?: 'png' | 'jpeg' }): Promise<Uint8Array>;
        pdf(options?: { format?: string; printBackground?: boolean; preferCSSPageSize?: boolean }): Promise<Uint8Array>;
        on(event: 'console', listener: (message: ConsoleMessage) => void): void;
        getByLabel(text: string, options?: { exact?: boolean }): Locator;
        getByRole(role: string, options?: { name?: string | RegExp; exact?: boolean }): Locator;
        getByText(text: string | RegExp, options?: { exact?: boolean }): Locator;
        locator(selector: string, options?: LocatorOptions): Locator;
        keyboard: { press(key: string): Promise<void> };
        mouse: { move(x: number, y: number, options?: { steps?: number }): Promise<void>; down(): Promise<void>; up(): Promise<void> };
        goto(url: string): Promise<unknown>;
        on(event: 'pageerror', listener: (error: Error) => void): void;
        on(event: 'request', listener: (request: { url(): string }) => void): void;
        on(event: 'dialog', listener: (dialog: Dialog) => void): void;
        once(event: 'dialog', listener: (dialog: Dialog) => void): void;
        reload(): Promise<unknown>;
        goBack(): Promise<unknown>;
        waitForURL(match: (url: URL) => boolean): Promise<void>;
        addInitScript(script: () => void): Promise<void>;
        url(): string;
        setViewportSize(size: { width: number; height: number }): Promise<void>;
        waitForFunction<A = undefined>(callback: (arg: A) => unknown, arg?: A, options?: { timeout?: number }): Promise<unknown>;
        waitForTimeout(ms: number): Promise<void>;
        bringToFront(): Promise<void>;
    }
    interface BrowserContext {
        newPage(): Promise<Page>;
        setOffline(offline: boolean): Promise<void>;
        addInitScript(script: () => void): Promise<void>;
        close(): Promise<void>;
        route(url: string | RegExp, handler: (route: Route) => unknown): Promise<void>;
        newCDPSession(page: Page): Promise<{ send(method: string, params?: object): Promise<unknown> }>;
    }
    interface Browser {
        close(): Promise<void>;
        newContext(options: {
            viewport: { width: number; height: number };
            serviceWorkers?: 'allow' | 'block';
            userAgent?: string;
            hasTouch?: boolean;
            isMobile?: boolean;
            deviceScaleFactor?: number;
        }): Promise<BrowserContext>;
    }
    export const chromium: { launch(): Promise<Browser> };
}
