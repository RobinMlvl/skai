import { createHash } from "node:crypto";
import type { Page } from "playwright";

export type ElementInfo = { id: string; role: string; name: string; value: string | null };
export type PageSnapshot = { url: string; title: string; text: string; elements: ElementInfo[]; fingerprint: string };

/** Never listed for Jev: SkAI must not select, book, pay, sign in or accept tracking. */
export const FORBIDDEN_TARGET = /select flight|book|continue|purchase|pay|sign in|accept|agree|allow all/i;

const MAX_ELEMENTS = 60;
const MAX_NAME_CHARS = 120;

/**
 * Lists visible, enabled, named interactive elements and tags each one with data-skai-id,
 * so the executor can click exactly the element Jev chose. Ids are assigned in DOM order,
 * so an unchanged page yields the same ids and the same fingerprint. An element whose full
 * name matches FORBIDDEN_TARGET is skipped in the page (never tagged, never counted), before
 * the name is shortened for display.
 */
export async function takeSnapshot(page: Page): Promise<PageSnapshot> {
  const raw = await page.evaluate(({ max, maxName, forbiddenSource, forbiddenFlags }) => {
    const forbidden = new RegExp(forbiddenSource, forbiddenFlags);
    const selector = [
      "button", "a[href]", "input", "select", "textarea",
      '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
      '[role="option"]', '[role="checkbox"]', '[role="switch"]', '[role="combobox"]',
    ].join(",");
    for (const tagged of document.querySelectorAll("[data-skai-id]")) tagged.removeAttribute("data-skai-id");
    const elements: { id: string; role: string; name: string; value: string | null }[] = [];
    for (const node of document.querySelectorAll(selector)) {
      if (!(node instanceof HTMLElement)) continue;
      const box = node.getBoundingClientRect();
      if (box.width < 2 || box.height < 2 || box.bottom < 0 || box.top > window.innerHeight) continue;
      if (!node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      if (node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true") continue;
      const fullName = (
        node.getAttribute("aria-label") ||
        node.innerText ||
        node.getAttribute("title") ||
        node.getAttribute("placeholder") ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      if (!fullName || forbidden.test(fullName)) continue;
      const name = fullName.slice(0, maxName);
      const id = `e${elements.length + 1}`;
      node.setAttribute("data-skai-id", id);
      const value = node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement
        ? node.value.slice(0, 80)
        : null;
      elements.push({ id, role: node.getAttribute("role") ?? node.tagName.toLowerCase(), name, value });
      if (elements.length >= max) break;
    }
    return {
      url: location.href,
      title: document.title,
      text: (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 1_500),
      elements,
    };
  }, {
    max: MAX_ELEMENTS,
    maxName: MAX_NAME_CHARS,
    forbiddenSource: FORBIDDEN_TARGET.source,
    forbiddenFlags: FORBIDDEN_TARGET.flags,
  });
  const fingerprint = createHash("sha1")
    .update(raw.url)
    .update(JSON.stringify(raw.elements))
    .digest("hex");
  return { ...raw, fingerprint };
}
