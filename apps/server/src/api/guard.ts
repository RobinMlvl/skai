import type { MiddlewareHandler } from "hono";

/**
 * SkAI's API drives a real Chrome window, so only this machine's own pages may call it.
 * - Host allowlist: @hono/node-server builds c.req.url from the Host header (blocks DNS rebinding).
 * - Origin allowlist: browsers attach Origin to cross-site requests.
 * - X-SkAI header on mutations: a foreign page cannot send it without a CORS preflight, never granted here.
 */
export function localGuard(allowedHosts: readonly string[]): MiddlewareHandler {
  const allowed = new Set(allowedHosts);
  return async (c, next) => {
    if (!allowed.has(new URL(c.req.url).host)) {
      return c.json({ error: "forbidden", message: "Unknown host" }, 403);
    }
    const origin = c.req.header("origin");
    if (origin !== undefined) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = "";
      }
      if (!allowed.has(originHost)) return c.json({ error: "forbidden", message: "Cross-origin request" }, 403);
    }
    const mutating = c.req.method !== "GET" && c.req.method !== "HEAD";
    if (mutating && c.req.header("x-skai") !== "1") {
      return c.json({ error: "forbidden", message: "Missing X-SkAI header" }, 403);
    }
    await next();
  };
}
