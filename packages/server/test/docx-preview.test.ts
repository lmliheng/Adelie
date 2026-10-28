/**
 * Word previews: the .docx → Markdown extraction and the route that serves it.
 *
 * The extraction:
 * - reads `word/document.xml` out of the zip and lays its paragraphs out as Markdown: headings
 *   from the paragraph's own style or outline level, list items indented by their level,
 *   bold/italic runs, tables as GFM tables, and the XML entities and line breaks Word writes;
 * - escapes what Markdown would otherwise read as syntax, so document text stays text, while the
 *   markers it writes itself are not escaped twice;
 * - refuses anything that is not a .docx (a zip without the document part, or not a zip at
 *   all), and cuts the output at its character cap with `truncated`.
 *
 * The route (`files/preview-text`, in both scopes):
 * - answers a .docx with Markdown, an ETag of the read version, `no-store`, and
 *   `X-Content-Truncated` when the extraction was cut;
 * - answers a legacy .doc with 415 `doc_legacy` and any other type with 415
 *   `preview_unavailable` — this route serves an extraction, never the file;
 * - answers an outsider with 404, and never touches a Workspace it was not given.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DOCX_PREVIEW_MAX_CHARS,
  DocxPreviewError,
  docxToMarkdown,
} from "../src/services/docx-preview.js";
import type { ProjectCreateResponse, SessionCreateResponse } from "../src/api/types.js";
import { apiClient, createTestApp, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

/** A .docx as Word writes one: a zip whose `word/document.xml` is the body. */
function docx(body: string, extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    ),
    ...extra,
  });
}

/** A run of plain text. */
const run = (text: string): string => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
/** A paragraph with the given inner XML. */
const para = (inner: string, props = ""): string =>
  `<w:p>${props === "" ? "" : `<w:pPr>${props}</w:pPr>`}${inner}</w:p>`;

describe("docxToMarkdown", () => {
  it("lays paragraphs out as Markdown: headings by style and outline level, bold and italic runs", () => {
    const body = [
      para(run("标题一"), '<w:pStyle w:val="Heading1"/>'),
      para(
        "<w:r><w:rPr><w:b/></w:rPr><w:t>粗体</w:t></w:r><w:r><w:t>与</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>斜体</w:t></w:r>",
      ),
      para(run("二级标题"), '<w:outlineLvl w:val="1"/>'),
      para(run("普通段落")),
    ].join("");

    expect(docxToMarkdown(docx(body)).markdown).toBe(
      ["# 标题一", "**粗体**与*斜体*", "## 二级标题", "普通段落"].join("\n\n"),
    );
  });

  it("indents list items by their own level and keeps tables as GFM tables", () => {
    const body = [
      para(run("第一项"), '<w:numPr><w:ilvl w:val="0"/></w:numPr>'),
      para(run("第二层"), '<w:numPr><w:ilvl w:val="1"/></w:numPr>'),
      `<w:tbl>${[
        "<w:tr><w:tc><w:p><w:r><w:t>指标</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>数据</w:t></w:r></w:p></w:tc></w:tr>",
        "<w:tr><w:tc><w:p><w:r><w:t>出货量</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1477 万台</w:t></w:r></w:p></w:tc></w:tr>",
      ].join("")}</w:tbl>`,
    ].join("");

    expect(docxToMarkdown(docx(body)).markdown).toBe(
      ["- 第一项", "  - 第二层", "| 指标 | 数据 |\n| --- | --- |\n| 出货量 | 1477 万台 |"].join(
        "\n\n",
      ),
    );
  });

  it("decodes entities and line breaks, and escapes text that would read as Markdown", () => {
    const body = [
      para(run("A &amp; B &lt;tag&gt; &#x4e2d;")),
      para(run("# 不是标题")),
      para("<w:r><w:t>第一行</w:t><w:br/><w:t>第二行</w:t></w:r>"),
      para(run("a*b_c[d]")),
    ].join("");
    const markdown = docxToMarkdown(docx(body)).markdown;
    expect(markdown).toContain("A & B \\<tag\\> 中");
    // The leading "#" would have made a heading; it is defused, not promoted.
    expect(markdown).toContain("\\# 不是标题");
    expect(markdown).toContain("第一行 第二行");
    expect(markdown).toContain("a\\*b\\_c\\[d\\]");
  });

  it("reads only the document part — a large sibling entry is never inflated", () => {
    const body = para(run("正文"));
    const archive = docx(body, { "word/media/image1.png": new Uint8Array(4 * 1024 * 1024) });
    expect(docxToMarkdown(archive).markdown).toBe("正文");
  });

  it("cuts the output at its character cap and says so", () => {
    const body = para(run("长".repeat(500)));
    const out = docxToMarkdown(docx(body), 100);
    expect(out.truncated).toBe(true);
    expect(out.markdown.length).toBe(100);
    expect(docxToMarkdown(docx(body)).truncated).toBe(false);
    expect(DOCX_PREVIEW_MAX_CHARS).toBe(200_000);
  });

  it("refuses what it cannot read: a zip without the document part, and bytes that are not a zip", () => {
    const empty = zipSync({ "word/styles.xml": strToU8("<styles/>") });
    expect(() => docxToMarkdown(empty)).toThrow(DocxPreviewError);
    expect(() => docxToMarkdown(strToU8("not a zip at all"))).toThrow(DocxPreviewError);
  });
});

/** The route: one owner, one outsider, one Session (and so one Workspace) per case. */
let t: TestApp;
let owner: ReturnType<typeof apiClient>;
let outsider: ReturnType<typeof apiClient>;
let projectId: string;

beforeAll(async () => {
  t = await createTestApp();
  owner = apiClient(t.app, (await provisionUser(t.app, "owner")).cookie);
  outsider = apiClient(t.app, (await provisionUser(t.app, "outsider")).cookie);
  const created = (await (
    await owner.post("/api/projects", { projectId: "owner-docx", name: "project" })
  ).json()) as ProjectCreateResponse;
  projectId = created.project.projectId;
  await owner.put(`/api/projects/${projectId}/models`, {
    defaultModel: { provider: "anthropic", modelId: "claude-sonnet-4-6" },
    models: [{ provider: "anthropic", modelId: "claude-sonnet-4-6", contextWindow: 128000 }],
  });
});
afterAll(async () => {
  await t.cleanup();
});

async function sessionWithWords(): Promise<{ sessionId: string; workspace: string }> {
  const sess = (await (
    await owner.post(`/api/projects/${projectId}/agents/default_agent/sessions`, {})
  ).json()) as SessionCreateResponse;
  const workspace = sess.session.workspace;
  await fs.writeFile(path.join(workspace, "doc.docx"), Buffer.from(docx(para(run("你好，Word")))));
  await fs.writeFile(path.join(workspace, "old.doc"), Buffer.from("%D0CF11E0 binary", "latin1"));
  await fs.writeFile(path.join(workspace, "notes.md"), "# md");
  return { sessionId: sess.session.sessionId, workspace };
}

describe("files/preview-text route", () => {
  it("answers a .docx with Markdown and the read's version; no cache, no sniffing", async () => {
    const { sessionId } = await sessionWithWords();
    const res = await owner.get(`/api/sessions/${sessionId}/files/preview-text?path=doc.docx`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("etag")).toMatch(/^W\/"\d+-\d+"$/);
    expect(res.headers.get("x-content-truncated")).toBeNull();
    expect(await res.text()).toBe("你好，Word");
  });

  it("names the two refusals apart: a legacy .doc says so, anything else is not extracted", async () => {
    const { sessionId } = await sessionWithWords();
    const legacy = await owner.get(`/api/sessions/${sessionId}/files/preview-text?path=old.doc`);
    expect(legacy.status).toBe(415);
    expect(await legacy.json()).toEqual({
      error: { code: "doc_legacy", message: expect.any(String) },
    });

    const other = await owner.get(`/api/sessions/${sessionId}/files/preview-text?path=notes.md`);
    expect(other.status).toBe(415);
    expect(await other.json()).toEqual({
      error: { code: "preview_unavailable", message: expect.any(String) },
    });
  });

  it("serves the directory scope too, and answers an outsider with 404", async () => {
    const { sessionId, workspace } = await sessionWithWords();
    const byDir = await owner.get(
      `/api/projects/${projectId}/workspace-files/preview-text?workspace=${encodeURIComponent(workspace)}&path=doc.docx`,
    );
    expect(byDir.status).toBe(200);
    expect(await byDir.text()).toBe("你好，Word");

    const nope = await outsider.get(`/api/sessions/${sessionId}/files/preview-text?path=doc.docx`);
    expect(nope.status).toBe(404);
  });
});
