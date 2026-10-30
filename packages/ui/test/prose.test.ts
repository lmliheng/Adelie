/**
 * Prose and Md: Markdown in its reading box, the three densities, the link default and the
 * resolver that overrides it, the image adapter and the resolver that points a src elsewhere (and
 * the zoom a conversation asks for), fenced code routed into CodeBlock, and the stylesheet the box
 * reads.
 * How the pipeline typesets math is prose-math.test.ts; where a bare URL ends is
 * remark-autolink-boundary.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  Md,
  PROSE_NEW_TAB,
  Prose,
  ProseImagesProvider,
  ProseLinksProvider,
  SETTLED_MD_COMPONENTS,
} from "../src/components/content/prose/prose";
import type { ProseImageResolver, ProseLinkResolver } from "../src/components/content/prose/prose";
import { DEFAULT_UI_STRINGS, UiStringsProvider } from "../src/strings";
import { classTokens, renderStatic } from "../src/testing";
import { SRC_DIR } from "./helpers/paths";

const PROSE = join(SRC_DIR, "components/content/prose");
const read = (name: string) => readFileSync(join(PROSE, name), "utf8");

/** All rendered <a ...> opening tags. */
const anchors = (html: string) => html.match(/<a\b[^>]*>/g) ?? [];

/** The src of every rendered <img>, in order. */
const imageSrcs = (html: string) =>
  (html.match(/<img\b[^>]*>/g) ?? []).map((tag) => /src="([^"]*)"/.exec(tag)?.[1] ?? "");

describe("Prose", () => {
  it("wraps the Markdown in the reading box, in the reading face, with the caller's ink", () => {
    const html = renderStatic(
      createElement(Prose, { text: "Hello **world**", className: "text-base text-fg" }),
    );
    expect(html).toMatch(/^<div class="md-body font-sans text-base text-fg">/);
    expect(html).toContain("<strong>world</strong>");
  });

  it("takes the three densities as class sets prose.css styles", () => {
    const tokens = (variant: "body" | "compact" | "flush") =>
      classTokens(renderStatic(createElement(Prose, { text: "x", variant })));
    expect(tokens("body")).toEqual(["font-sans", "md-body"]);
    expect(tokens("compact")).toEqual(["font-sans", "md-body", "md-compact"]);
    expect(tokens("flush")).toEqual(["font-sans", "md-body", "md-body-flush"]);
  });
});

describe("Md links", () => {
  it("open in a new tab when no resolver is provided", () => {
    const tags = anchors(
      renderStatic(createElement(Md, { text: "[a](https://example.com) and [b](notes.md)" })),
    );
    expect(tags).toHaveLength(2);
    for (const tag of tags) {
      expect(tag).toContain('target="_blank"');
      expect(tag).toContain('rel="noreferrer"');
    }
    expect(PROSE_NEW_TAB).toEqual({ target: "_blank", rel: "noreferrer" });
  });

  it("take what a resolver decides, per href, after the href itself", () => {
    const seen: (string | undefined)[] = [];
    const resolve: ProseLinkResolver = (href) => {
      seen.push(href);
      return href?.startsWith("https:") ? PROSE_NEW_TAB : {};
    };
    const html = renderStatic(
      createElement(ProseLinksProvider, {
        resolve,
        children: createElement(Md, { text: "[a](https://example.com) and [b](notes.md)" }),
      }),
    );
    const [external, local] = anchors(html);
    expect(external).toContain('target="_blank"');
    expect(local).toContain('href="notes.md"');
    expect(local).not.toContain("target=");
    expect(seen).toEqual(["https://example.com", "notes.md"]);
  });

  it("carry a link title as the shared tooltip, not a native title", () => {
    const [tag] = anchors(renderStatic(createElement(Md, { text: '[a](https://x.dev "Docs")' })));
    expect(tag).toContain('data-tooltip="Docs"');
    expect(tag).not.toContain("title=");
  });
});

describe("Md images", () => {
  it("keep the src the Markdown wrote when no resolver is provided", () => {
    const srcs = imageSrcs(renderStatic(createElement(Md, { text: "![cat](shots/cat.png)" })));
    expect(srcs).toEqual(["shots/cat.png"]);
  });

  it("take what a resolver decides, per src, and answer with null to keep the written one", () => {
    const seen: [string, string][] = [];
    const resolve: ProseImageResolver = (src, alt) => {
      seen.push([src, alt]);
      return src.endsWith(".png") ? { src: `/files/${src}` } : null;
    };
    const srcs = imageSrcs(
      renderStatic(
        createElement(ProseImagesProvider, {
          resolve,
          children: createElement(Md, { text: "![截图](a.png) ![remote](https://x.dev/b.jpg)" }),
        }),
      ),
    );
    expect(srcs).toEqual(["/files/a.png", "https://x.dev/b.jpg"]);
    expect(seen).toEqual([
      ["a.png", "截图"],
      ["https://x.dev/b.jpg", "remote"],
    ]);
    // The rest of the element is untouched: alt text and lazy loading are the adapter's own.
    const tags = renderStatic(
      createElement(ProseImagesProvider, {
        resolve,
        children: createElement(Md, { text: "![截图](a.png)" }),
      }),
    ).match(/<img\b[^>]*>/g);
    expect(tags?.[0]).toContain('alt="截图"');
    expect(tags?.[0]).toContain('loading="lazy"');
  });

  it('never render src="", which would ask the browser for the page itself', () => {
    const tags = renderStatic(createElement(Md, { text: "![a]()" })).match(/<img\b[^>]*>/g);
    expect(tags?.[0]).toContain('alt="a"');
    expect(tags?.[0]).not.toContain("src=");
  });

  it("stay a bare picture on a surface that does not ask for zoom", () => {
    const html = renderStatic(
      createElement(ProseImagesProvider, {
        resolve: null,
        children: createElement(Md, { text: "![截图](a.png)" }),
      }),
    );
    // A README's badge is decoration: a click on it must keep doing whatever the page around it does.
    expect(html).toContain('<img src="a.png" alt="截图" loading="lazy"/>');
    expect(html).not.toContain("<button");
  });

  it("become a button over the lightbox when the provider is zoomable", () => {
    const html = renderStatic(
      createElement(ProseImagesProvider, {
        resolve: null,
        zoomable: true,
        children: createElement(Md, { text: "![截图](a.png)" }),
      }),
    );
    expect(html).toContain('<button type="button" class="block cursor-zoom-in">');
    expect(html).toContain('<img src="a.png" alt="截图" loading="lazy"/>');
    // Nothing is portalled over the page until the picture is clicked.
    expect(html.match(/<img\b/g)).toHaveLength(1);
  });

  it("zoom the src the resolver chose, not the one the Markdown wrote", () => {
    const html = renderStatic(
      createElement(ProseImagesProvider, {
        resolve: () => ({ src: "/files/a.png" }),
        zoomable: true,
        children: createElement(Md, { text: "![截图](a.png)" }),
      }),
    );
    expect(imageSrcs(html)).toEqual(["/files/a.png"]);
  });

  it("keep a picture with nothing to enlarge a bare picture even when zoomable", () => {
    const html = renderStatic(
      createElement(ProseImagesProvider, {
        resolve: null,
        zoomable: true,
        children: createElement(Md, { text: "![a]()" }),
      }),
    );
    expect(html).not.toContain("<button");
    expect(html).not.toContain("src=");
  });

  it("ask the actions resolver about the src as written, not the one the resolver produced", () => {
    // What the surface above can do with the picture depends on what its src NAMES — a Workspace
    // path — whereas the URL it renders is that surface's own private spelling (a file route).
    const seen: [string, string][] = [];
    renderStatic(
      createElement(ProseImagesProvider, {
        resolve: () => ({ src: "/api/sessions/s1/files/content?path=a.png" }),
        zoomable: true,
        actions: (src, alt) => {
          seen.push([src, alt]);
          return null;
        },
        children: createElement(Md, { text: "![截图](a.png)" }),
      }),
    );
    expect(seen).toEqual([["a.png", "截图"]]);
  });

  it("leave a picture the author wrapped in a link to that link", () => {
    const html = renderStatic(
      createElement(ProseImagesProvider, {
        resolve: null,
        zoomable: true,
        children: createElement(Md, { text: "[![截图](a.png)](https://x.dev/page)" }),
      }),
    );
    // A button in an anchor fires both handlers (the picture would open a tab and an overlay at
    // once), so the link keeps the click it was given.
    expect(html).not.toContain("<button");
    expect(anchors(html)[0]).toContain('href="https://x.dev/page"');
    expect(html).toContain('<img src="a.png" alt="截图"');
  });

  it("zoom a picture that sits beside a link, not one inside it", () => {
    const html = renderStatic(
      createElement(ProseImagesProvider, {
        resolve: null,
        zoomable: true,
        children: createElement(Md, { text: "[doc](https://x.dev) ![截图](a.png)" }),
      }),
    );
    expect(html).toContain('<button type="button" class="block cursor-zoom-in">');
  });
});

describe("Md code", () => {
  it("routes a fenced block into CodeBlock, named in the interface's words", () => {
    const zh = { ...DEFAULT_UI_STRINGS, copyCode: "复制代码" };
    const html = renderStatic(
      createElement(UiStringsProvider, {
        strings: zh,
        children: createElement(Md, { text: "```ts\nconst a = 1;\n```" }),
      }),
    );
    expect(html).toContain("code-block");
    expect(html).toContain('aria-label="复制代码"');
    expect(html).toContain("const a = 1;");
  });

  it("keeps inline code a bare <code> for the stylesheet to dress", () => {
    const html = renderStatic(createElement(Md, { text: "run `pnpm test` now" }));
    expect(html).toContain("<code>pnpm test</code>");
  });

  it("lets a surface add adapters over the settled map without losing the code block", () => {
    // The map's own three: the link and image resolvers and the code-block pre override. A
    // surface adds over them (the file browser's img is exactly that), never instead of them.
    expect(Object.keys(SETTLED_MD_COMPONENTS).sort()).toEqual(["a", "img", "pre"]);
    const html = renderStatic(
      createElement(Md, {
        text: "![alt](pic.png)\n\n```\nx\n```",
        components: { img: () => createElement("i", null, "image") },
      }),
    );
    expect(html).toContain("<i>image</i>");
    expect(html).toContain("code-block");
  });
});

describe("the content stylesheet", () => {
  const css = read("prose.css");

  it("is loaded by the components that need it, KaTeX's sheet with the Markdown", () => {
    expect(read("prose.tsx")).toMatch(/import "katex\/dist\/katex\.min\.css";/);
    expect(read("prose.tsx")).toMatch(/import "\.\/prose\.css";/);
    const code = readFileSync(
      join(SRC_DIR, "components/content/code-block/code-block.tsx"),
      "utf8",
    );
    expect(code).toMatch(/import "\.\.\/prose\/prose\.css";/);
  });

  it("stays unlayered and free of Tailwind directives, so it needs no build pass and beats utilities", () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toMatch(/@layer|@apply|@reference|@import/);
  });

  it("colours through tokens alone, and switches mode only for Shiki's own palette", () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|\brgb\(|\boklch\(/i);
    expect(rules).not.toMatch(/--color-/);
    expect(rules.match(/\.dark\b/g)).toHaveLength(2);
    expect(rules).toMatch(/html\.dark \.shiki,\s*html\.dark \.shiki span \{/);
  });

  it("keeps the code-surface resets after the Markdown pre rule they override at equal weight", () => {
    expect(css.indexOf(".md-body pre {")).toBeGreaterThan(-1);
    expect(css.indexOf(".code-surface :is(pre, textarea) {")).toBeGreaterThan(
      css.indexOf(".md-body pre {"),
    );
  });
});
