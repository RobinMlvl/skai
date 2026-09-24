import { chromium, type BrowserContext, type Page } from "playwright";

export interface BrowserSession {
  page(): Promise<Page>;
  close(): Promise<void>;
}

/** One persistent Chrome profile dedicated to SkAI, launched on first use and reused. */
export function createBrowserSession(options: { profileDir: string; headless?: boolean }): BrowserSession {
  let context: Promise<BrowserContext> | null = null;

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
      return ctx.pages()[0] ?? (await ctx.newPage());
    },
    async close() {
      const current = context;
      context = null;
      if (current) await (await current).close().catch(() => undefined);
    },
  };
}
