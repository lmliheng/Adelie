/**
 * 「是不是本站」「能不能交给系统浏览器」—— 这两条是壳把网页关在它该在的范围里的边界，
 * 所以逐条验一遍越界的情形。
 */
import { describe, expect, it } from "vitest";
import { isOpenableUrl, sameOrigin } from "../src/links.js";

describe("sameOrigin", () => {
  const origin = "http://127.0.0.1:7370";

  it("同一个来源（含路径）算本站", () => {
    expect(sameOrigin(`${origin}/`, origin)).toBe(true);
    expect(sameOrigin(`${origin}/sessions/42?x=1#y`, origin)).toBe(true);
  });

  it("换端口就是换站点 —— 端口记忆坏掉时正是这个症状", () => {
    expect(sameOrigin("http://127.0.0.1:7371/", origin)).toBe(false);
  });

  it("换主机、换 scheme 都不算", () => {
    expect(sameOrigin("http://localhost:7370/", origin)).toBe(false);
    expect(sameOrigin("https://127.0.0.1:7370/", origin)).toBe(false);
  });

  it("解析不了的既不算本站也不抛", () => {
    expect(sameOrigin("", origin)).toBe(false);
    expect(sameOrigin("/sessions/42", origin)).toBe(false);
    expect(sameOrigin("不是 URL", origin)).toBe(false);
  });
});

describe("isOpenableUrl", () => {
  it("http / https / mailto 放行", () => {
    expect(isOpenableUrl("https://github.com/lmliheng/Adelie")).toBe(true);
    expect(isOpenableUrl("http://example.com/")).toBe(true);
    expect(isOpenableUrl("mailto:someone@example.com")).toBe(true);
  });

  it("能借壳的手去启动别的东西的 scheme 一律不放行", () => {
    for (const url of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "vscode://file/tmp/x",
      "ms-settings:privacy",
    ]) {
      expect(isOpenableUrl(url)).toBe(false);
    }
  });

  it("空串与相对路径不放行", () => {
    expect(isOpenableUrl("")).toBe(false);
    expect(isOpenableUrl("/api/health")).toBe(false);
  });
});
