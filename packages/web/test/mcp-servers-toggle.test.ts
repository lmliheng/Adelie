/**
 * The MCP Server row's switch (src/features/agents/mcp-servers-toggle.ts): the list one flip
 * produces, and which row draws the sentence when the write it sent is refused.
 *
 * The switch keeps the state the server has — nothing is written optimistically — so these are
 * the two halves of what the person sees after a refused flip: the list must come back untouched,
 * and only the row that asked may carry the reason.
 */
import { describe, expect, it } from "vitest";
import type { MCPServerConfig } from "@adelie/core/interfaces";
import {
  flippedEnabled,
  toggleRefusalFor,
  type McpToggleRefusal,
} from "../src/features/agents/mcp-servers-toggle";

const list = (): MCPServerConfig[] => [
  { name: "filesystem", config: { command: "npx", args: ["-y", "pkg"], enabled: false } },
  { name: "wps", config: { url: "https://example.com/mcp", permission: "r" } },
];

describe("flippedEnabled", () => {
  it("turns a server off by storing false, and keeps its other fields", () => {
    const next = flippedEnabled(list(), 1);
    expect(next[1]).toEqual({
      name: "wps",
      config: { url: "https://example.com/mcp", permission: "r", enabled: false },
    });
  });

  it("turns a server back on by dropping the key, so it keeps following the default", () => {
    const next = flippedEnabled(list(), 0);
    // Not `enabled: true`: an absent key is what core (and the form) read as on.
    expect(next[0]).toEqual({
      name: "filesystem",
      config: { command: "npx", args: ["-y", "pkg"] },
    });
    expect(next[0] && "enabled" in next[0].config).toBe(false);
  });

  it("leaves every other entry exactly as it came in", () => {
    const before = list();
    const next = flippedEnabled(before, 1);
    expect(next[0]).toBe(before[0]);
    // And the input list itself is untouched: the same object is read again by the next flip.
    expect(before[1]).toEqual({
      name: "wps",
      config: { url: "https://example.com/mcp", permission: "r" },
    });
  });

  it("changes nothing when the row is no longer there", () => {
    const before = list();
    const next = flippedEnabled(before, 2);
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(before[0]);
    expect(next[1]).toBe(before[1]);
  });
});

describe("toggleRefusalFor", () => {
  const refused: McpToggleRefusal = { index: 1, text: "配置是只读的。" };

  it("draws nothing while no flip has been refused", () => {
    expect(toggleRefusalFor(null, 0)).toBeNull();
    expect(toggleRefusalFor(null, 1)).toBeNull();
  });

  it("draws the sentence on the row whose switch asked", () => {
    expect(toggleRefusalFor(refused, 1)).toBe("配置是只读的。");
  });

  it("keeps quiet on the other rows — they were never written to", () => {
    expect(toggleRefusalFor(refused, 0)).toBeNull();
    expect(toggleRefusalFor(refused, 2)).toBeNull();
  });

  it("keeps quiet on a row that merely shares the refused row's name (a hand-edited config may)", () => {
    // Names are not guaranteed unique, which is why the row is identified by its position: a
    // sentence keyed by name would have been drawn twice here.
    const duplicated: MCPServerConfig[] = [
      { name: "dup", config: { url: "https://a.example/mcp" } },
      { name: "dup", config: { url: "https://b.example/mcp" } },
    ];
    const next = flippedEnabled(duplicated, 1);
    expect(next[1]?.config["enabled"]).toBe(false);
    expect(toggleRefusalFor(refused, 0)).toBeNull();
    expect(toggleRefusalFor(refused, 1)).toBe("配置是只读的。");
  });
});
