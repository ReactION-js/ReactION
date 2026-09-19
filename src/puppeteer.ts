import puppeteer, { type Browser, type Page } from "puppeteer-core";
import type { RawReactNode } from "./TreeNode";
import { type ReactionConfig, toUrl } from "./config";

export default class Puppeteer {
  private browser: Browser | undefined;
  private page: Page | undefined;
  private readonly headless: boolean;
  private readonly executablePath: string;
  private readonly url: string;

  public constructor(config: ReactionConfig) {
    this.headless = config.headless_browser;
    this.executablePath = config.executablePath;
    this.url = toUrl(config.localhost);
  }

  // Launches Chrome and navigates to the target React app, reusing the first
  // open tab so the user sees a single window. Throws if Chrome cannot launch.
  public async start(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: this.headless,
      executablePath: this.executablePath,
      pipe: true,
    });

    const pages = await this.browser.pages();
    this.page = pages[0] ?? (await this.browser.newPage());
    await this.page.goto(this.url, { waitUntil: "domcontentloaded" });
  }

  public async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
    this.page = undefined;
  }

  // Walks the React fiber tree in the page and returns a flat, pre-ordered list
  // of components. Returns an empty array when the page has no React app yet.
  public async scrape(): Promise<RawReactNode[]> {
    if (!this.page) {
      return [];
    }

    return this.page.evaluate(() => {
      /* Everything below runs in the page (browser) context. */

      interface Fiber {
        tag: number;
        type: unknown;
        child: Fiber | null;
        sibling: Fiber | null;
        return: Fiber | null;
        memoizedProps: Record<string, unknown> | null;
      }

      // Safely reads a nested property path off an untyped object.
      const readPath = (obj: unknown, keys: string[]): unknown => {
        let current: unknown = obj;
        for (const key of keys) {
          if (current && typeof current === "object" && key in current) {
            current = (current as Record<string, unknown>)[key];
          } else {
            return undefined;
          }
        }
        return current;
      };

      // Finds the root fiber for legacy ReactDOM.render (React 16/17) or
      // createRoot (React 18/19).
      const findRootFiber = (): Fiber | null => {
        const elements: Element[] = [
          document.body,
          ...Array.from(document.querySelectorAll("body *")),
        ];

        for (const el of elements) {
          const node = el as unknown as Record<string, unknown>;

          // Legacy roots (React 16/17).
          const legacy = readPath(node, [
            "_reactRootContainer",
            "_internalRoot",
            "current",
          ]);
          if (legacy) {
            return legacy as Fiber;
          }

          // Concurrent roots (React 18/19) expose the host-root fiber through a
          // "__reactContainer$<hash>" property on the container element.
          const containerKey = Object.keys(node).find((key) =>
            key.startsWith("__reactContainer$"),
          );
          if (containerKey) {
            return node[containerKey] as Fiber;
          }
        }

        // Fallback: any host node carries a "__reactFiber$<hash>" pointer we can
        // walk up to the root.
        for (const el of elements) {
          const node = el as unknown as Record<string, unknown>;
          const fiberKey = Object.keys(node).find((key) =>
            key.startsWith("__reactFiber$"),
          );
          if (fiberKey) {
            let fiber = node[fiberKey] as Fiber;
            while (fiber.return) {
              fiber = fiber.return;
            }
            return fiber;
          }
        }

        return null;
      };

      // Resolves a readable component name for a fiber's type.
      const displayNameOf = (fiber: Fiber): string => {
        const type = fiber.type;
        if (type == null) {
          return fiber.tag === 3 ? "Root" : "";
        }
        if (typeof type === "string") {
          return type;
        }
        if (typeof type === "function") {
          const fn = type as { displayName?: string; name?: string };
          return fn.displayName || fn.name || "Anonymous";
        }
        if (typeof type === "object") {
          // forwardRef / memo / context wrappers.
          const wrapper = type as {
            displayName?: string;
            type?: { displayName?: string; name?: string };
            render?: { name?: string };
          };
          return (
            wrapper.displayName ||
            wrapper.type?.displayName ||
            wrapper.type?.name ||
            wrapper.render?.name ||
            "Component"
          );
        }
        return String(type);
      };

      const root = findRootFiber();
      if (!root) {
        return [];
      }

      const nodes: RawReactNode[] = [];
      let nextId = 1;

      // Pre-order walk: a fiber's children are its `child` plus that child's
      // `sibling` chain, all sharing the same parent id.
      const visit = (fiber: Fiber, parentId: string): void => {
        const id = String(nextId++);
        nodes.push({
          id,
          parentId,
          name: displayNameOf(fiber),
          props: fiber.memoizedProps ? Object.keys(fiber.memoizedProps) : [],
        });

        let child = fiber.child;
        while (child) {
          visit(child, id);
          child = child.sibling;
        }
      };

      visit(root, "");
      return nodes;
    });
  }
}
