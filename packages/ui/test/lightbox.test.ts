/**
 * Lightbox and ZoomableImage (src/components/overlays/lightbox/lightbox.tsx): the thumbnail keeps
 * the caller's styling and mounts nothing else until clicked; the lightbox names its close glyph in
 * the interface's words, dims the page through the scrim hook, and closes on Escape only through
 * the shared layer stack, so a lightbox opened inside a dialog closes alone. A batch opens on the
 * picture that was clicked, shows its thumbnails and a step counter, and every picture can be
 * saved — the bar holds only what the page can really do.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Lightbox, ZoomableImage } from "../src/components/overlays/lightbox/lightbox";
import type { LightboxImage } from "../src/components/overlays/lightbox/lightbox";
import { DEFAULT_UI_STRINGS, UiStringsProvider } from "../src/strings";
import { classTokens, renderStatic } from "../src/testing";
import { stubDialogGlobals } from "./helpers/dialog-env";
import { SRC_DIR } from "./helpers/paths";

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  createPortal: (node: ReactNode) => node,
}));
stubDialogGlobals();

const noop = () => {};
const lightbox = (closeLabel?: string) =>
  renderStatic(
    createElement(Lightbox, { open: true, src: "/a.png", alt: "Chart", onClose: noop, closeLabel }),
  );

/** The `<img>` tags of a rendered lightbox, in DOM order: the picture first, then its thumbnails. */
const images = (html: string) => html.match(/<img\b[^>]*>/g) ?? [];

describe("ZoomableImage", () => {
  it("is a button around the caller's thumbnail, with the lightbox not yet mounted", () => {
    const html = renderStatic(
      createElement(ZoomableImage, { src: "/a.png", alt: "Chart", className: "h-20" }),
    );
    // React 19's server renderer prepends a preload hint for an eager image; not our markup.
    expect(html.replace(/^<link rel="preload"[^>]*\/>/, "")).toBe(
      '<button type="button" class="block cursor-zoom-in"><img src="/a.png" alt="Chart" class="h-20"/></button>',
    );
  });

  it("carries the caller's other picture attributes to the thumbnail, not to the lightbox", () => {
    const html = renderStatic(
      createElement(ZoomableImage, {
        src: "/a.png",
        alt: "Chart",
        title: "预览",
        width: 320,
        lazy: true,
      }),
    );
    const thumbnail = html.match(/<img\b[^>]*>/)?.[0] ?? "";
    expect(thumbnail).toContain('title="预览"');
    expect(thumbnail).toContain('width="320"');
    expect(thumbnail).toContain('loading="lazy"');
  });
});

describe("Lightbox", () => {
  it("renders nothing while closed", () => {
    expect(
      renderStatic(
        createElement(Lightbox, { open: false, src: "/a.png", alt: "Chart", onClose: noop }),
      ),
    ).toBe("");
  });

  it("shows the image whole, with its alt text", () => {
    expect(lightbox()).toMatch(/<img src="\/a\.png" alt="Chart" class="[^"]*"\/>/);
  });

  it("names its close glyph in the interface's words, or the caller's", () => {
    expect(lightbox()).toContain('aria-label="Close"');
    const injected = renderStatic(
      createElement(
        UiStringsProvider,
        { strings: { ...DEFAULT_UI_STRINGS, close: "关闭" } },
        createElement(Lightbox, { open: true, src: "/a.png", alt: "Chart", onClose: noop }),
      ),
    );
    expect(injected).toContain('aria-label="关闭"');
    expect(lightbox("Close the image")).toContain('aria-label="Close the image"');
  });

  it("dims the page through the scrim, and paints in tokens", () => {
    expect(classTokens(lightbox())).toEqual(
      expect.arrayContaining([
        "ui-scrim",
        "bg-[var(--ui-overlay-backdrop)]",
        "bg-fg/50",
        "text-canvas",
        "border-line",
        "bg-surface",
      ]),
    );
  });

  it("closes on Escape through the shared layer stack, never a listener of its own", () => {
    const text = readFileSync(join(SRC_DIR, "components/overlays/lightbox/lightbox.tsx"), "utf8");
    expect(text).toContain("useEscLayer(open, close)");
    expect(text).not.toMatch(/"keydown"/);
  });
});

const BATCH: readonly LightboxImage[] = [
  { src: "/a.png", alt: "Chart" },
  { src: "/b.png", alt: "Table" },
  { src: "/c.png", alt: "Diagram" },
];

/** The batch opened on its middle picture, as clicking that thumbnail would. */
const batchOpened = () =>
  renderStatic(
    createElement(Lightbox, {
      open: true,
      src: "/b.png",
      alt: "Table",
      onClose: noop,
      images: BATCH,
    }),
  );

describe("Lightbox's bar", () => {
  it("saves the picture shown, under the name its src gives it", () => {
    expect(lightbox()).toContain('href="/a.png"');
    expect(lightbox()).toContain('download="a.png"');
    expect(lightbox()).toContain(">Download</span>");
  });

  it("takes the name the route carries when its own segment is only an id", () => {
    const html = renderStatic(
      createElement(Lightbox, {
        open: true,
        src: "/api/sessions/s-1/files/content?path=shot.png",
        alt: "Shot",
        onClose: noop,
      }),
    );
    expect(html).toContain('download="shot.png"');
  });

  it("speaks its labels in the interface's words", () => {
    const batchHtml = renderStatic(
      createElement(
        UiStringsProvider,
        {
          strings: {
            ...DEFAULT_UI_STRINGS,
            download: "下载",
            previousImage: "上一张图片",
            nextImage: "下一张图片",
          },
        },
        createElement(Lightbox, {
          open: true,
          src: "/b.png",
          alt: "Table",
          onClose: noop,
          images: BATCH,
        }),
      ),
    );
    expect(batchHtml).toContain('aria-label="上一张图片"');
    expect(batchHtml).toContain('aria-label="下一张图片"');
    expect(batchHtml).toContain(">下载</span>");
  });

  it("holds no step buttons for a single picture — there is nowhere to step", () => {
    expect(lightbox()).not.toContain('aria-label="Previous image"');
    expect(lightbox()).not.toContain('aria-label="Next image"');
    expect(lightbox()).not.toContain("1 / 1");
  });
});

describe("Lightbox with a batch", () => {
  it("opens on the picture that was clicked, not on the batch's first", () => {
    const [shown] = images(batchOpened());
    expect(shown).toContain('src="/b.png"');
    expect(shown).toContain("max-h-[85vh]");
  });

  it("shows one thumbnail per picture, marking the one on screen", () => {
    const thumbnails = images(batchOpened()).slice(1);
    expect(thumbnails.map((tag) => tag.match(/src="([^"]*)"/)?.[1])).toEqual([
      "/a.png",
      "/b.png",
      "/c.png",
    ]);
    // Decorative in the strip: the button's own name describes it, so the <img> says nothing
    // twice — and the buttons' names are the pictures' alts.
    expect(thumbnails.every((tag) => tag.includes('alt=""'))).toBe(true);
    const buttons = batchOpened().match(/aria-current="true"/g) ?? [];
    expect(buttons).toHaveLength(1);
    expect(batchOpened().match(/aria-label="Table"/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it("counts the batch in step form: the picture shown, then how many there are", () => {
    const text = batchOpened().replace(/<[^>]*>/g, " ");
    expect(text).toMatch(/2\s*\/\s*3/);
  });

  it("falls back to the single picture when the batch is empty", () => {
    const html = renderStatic(
      createElement(Lightbox, {
        open: true,
        src: "/a.png",
        alt: "Chart",
        onClose: noop,
        images: [],
      }),
    );
    expect(images(html)).toHaveLength(1);
    expect(html).not.toContain("1 / 1");
  });

  it("paints the bar in tokens, never a palette colour", () => {
    expect(classTokens(batchOpened())).toEqual(
      expect.arrayContaining(["rounded-full", "border-line", "bg-surface", "text-fg-muted"]),
    );
  });
});
