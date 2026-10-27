// Only what the e2e scripts use. The real package lives in the dev container, not in package.json
// (installing it downloads browsers), so there are no bundled types to rely on.
declare module 'playwright' {
    interface Locator {
        click(): Promise<void>;
        fill(value: string): Promise<void>;
        first(): Locator;
        waitFor(options?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number }): Promise<void>;
        textContent(): Promise<string | null>;
        inputValue(): Promise<string>;
        getAttribute(name: string): Promise<string | null>;
        count(): Promise<number>;
        isVisible(): Promise<boolean>;
        allTextContents(): Promise<string[]>;
        locator(selector: string): Locator;
        press(key: string): Promise<void>;
        evaluate<T>(callback: (element: HTMLElement) => T): Promise<T>;
    }
    interface Dialog {
        message(): string;
        accept(): Promise<void>;
        dismiss(): Promise<void>;
    }
    interface Page {
        evaluate<T>(callback: () => T | Promise<T>): Promise<T>;
        getByLabel(text: string, options?: { exact?: boolean }): Locator;
        getByRole(role: string, options: { name: string | RegExp; exact?: boolean }): Locator;
        getByText(text: string | RegExp, options?: { exact?: boolean }): Locator;
        locator(selector: string): Locator;
        goto(url: string): Promise<unknown>;
        on(event: 'pageerror', listener: (error: Error) => void): void;
        on(event: 'dialog', listener: (dialog: Dialog) => void): void;
        once(event: 'dialog', listener: (dialog: Dialog) => void): void;
        reload(): Promise<unknown>;
        url(): string;
        setViewportSize(size: { width: number; height: number }): Promise<void>;
        waitForFunction(callback: () => unknown, options?: { timeout?: number }): Promise<unknown>;
        waitForTimeout(ms: number): Promise<void>;
        bringToFront(): Promise<void>;
    }
    interface BrowserContext {
        newPage(): Promise<Page>;
        setOffline(offline: boolean): Promise<void>;
        close(): Promise<void>;
    }
    interface Browser {
        close(): Promise<void>;
        newContext(options: { viewport: { width: number; height: number } }): Promise<BrowserContext>;
    }
    export const chromium: { launch(): Promise<Browser> };
}
