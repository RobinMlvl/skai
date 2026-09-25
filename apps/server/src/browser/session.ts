import { chromium, type BrowserContext, type Page } from "playwright";

export interface BrowserSession {
  /** The tab scans run in: the window's first tab, or a new one if the user closed it. */
  page(): Promise<Page>;
  /** A new tab in SkAI's window (bookings open there, beside the scan tab; never used for scans). */
  newPage(): Promise<Page>;
  close(): Promise<void>;
}

/** One persistent Chrome profile dedicated to SkAI, launched on first use and reused. */
export function createBrowserSession(options: { profileDir: string; headless?: boolean }): BrowserSession {
  let context: Promise<BrowserContext> | null = null;
  let scanTab: Page | null = null;

  const open = () => {
    const launched = chromium
      .launchPersistentContext(options.profileDir, {
        channel: "chrome",
        headless: options.headless ?? false,
        locale: "en-US",
        viewport: { width: 1280, height: 900 },
      })
      .then((ctx) => {
        ctx.on("close", () => {
          context = null;
        });
        scanTab = ctx.pages()[0] ?? null;
        return ctx;
      });
    launched.catch(() => {
      context = null;
    });
    return launched;
  };

  return {
    async page() {
      context ??= open();
      const ctx = await context;
      if (!scanTab || scanTab.isClosed()) scanTab = await ctx.newPage();
      return scanTab;
    },
    async newPage() {
      context ??= open();
      return (await context).newPage();
    },
    async close() {
      const current = context;
      context = null;
      if (current) await (await current).close().catch(() => undefined);
    },
  };
}
