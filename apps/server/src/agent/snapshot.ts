import { createHash } from "node:crypto";
import type { Page } from "playwright";

export type ElementInfo = { id: string; role: string; name: string; value: string | null };
export type PageSnapshot = { url: string; title: string; text: string; elements: ElementInfo[]; fingerprint: string };

const MAX_ELEMENTS = 60;

/**
 * Lists visible, enabled, named interactive elements and tags each one with data-skai-id,
 * so the executor can click exactly the element Jev chose. Ids are assigned in DOM order,
 * so an unchanged page yields the same ids and the same fingerprint.
 */
export async function takeSnapshot(page: Page): Promise<PageSnapshot> {
  const raw = await page.evaluate((max) => {
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
      const name = (
        node.getAttribute("aria-label") ||
        node.innerText ||
        node.getAttribute("title") ||
        node.getAttribute("placeholder") ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      if (!name) continue;
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
  }, MAX_ELEMENTS);
  const fingerprint = createHash("sha1")
    .update(raw.url)
    .update(JSON.stringify(raw.elements))
    .digest("hex");
  return { ...raw, fingerprint };
}
