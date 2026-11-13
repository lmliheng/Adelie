/**
 * The Trace panel's shell (features/traces/trace-panel.tsx): the Transport view is on screen in
 * EVERY state of the file listing, not only when a Trace file is readable.
 *
 * Regression: it used to be rendered inside the branch that has a file to show, so a Session that
 * had produced no Trace yet — the panel's 「暂无轨迹」 empty state, which is exactly the state a
 * conversation that never got an answer sits in — swallowed it, and the one view that answers
 * "did the stream deliver anything" was unreachable when the question was being asked.
 *
 * Rendered to static markup, so the effects that fetch the listing never run: every scenario
 * below is the `files === null` state the panel mounts in.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionInfo } from "@adelie/server/api";
import { TracePanel } from "../src/features/traces/trace-panel";
import { S } from "../src/lib/strings";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

const session = { sessionId: "s1" } as unknown as SessionInfo;

it("draws the Transport view while the listing is still loading", () => {
  const html = renderToStaticMarkup(
    createElement(TracePanel, { session, active: true, reloadSignal: 0 }),
  );
  expect(html).toContain(S.tracePanel.transport);
  // The loading branch still draws its skeleton below it.
  expect(html).toContain("animate-pulse");
});

it("draws it with no Session selected either", () => {
  const html = renderToStaticMarkup(
    createElement(TracePanel, { session, active: false, reloadSignal: 3 }),
  );
  expect(html).toContain(S.tracePanel.transport);
});
