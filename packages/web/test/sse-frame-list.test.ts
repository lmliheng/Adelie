/**
 * The Transport view's markup (features/traces/sse-frame-list.tsx): off by default, and what a
 * reader gets once it is on — the recorded frames, newest first, in the wire's own words, with
 * another Session's channel kept out.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clearSseFrames,
  noteSseFrame,
  receivedEntry,
  setSseFramesEnabled,
} from "../src/api/sse-frames";
import { SseFrameList } from "../src/features/traces/sse-frame-list";
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

afterEach(() => {
  clearSseFrames();
});

const render = (sessionId = "s1") =>
  renderToStaticMarkup(createElement(SseFrameList, { sessionId, active: true }));

it("starts off, saying what turning it on would do", () => {
  noteSseFrame(receivedEntry("session", "s1", "ping", null, "{}"));
  const html = render();
  expect(html).toContain(S.tracePanel.transportOff);
  expect(html).toContain(S.tracePanel.transportHint);
  expect(html).not.toContain(S.tracePanel.transportCount(1));
});

it("lists the recorded frames newest first, and leaves another Session's channel out", () => {
  setSseFramesEnabled(true);
  noteSseFrame(receivedEntry("session", "s1", "ping", "e-1", "{}"));
  noteSseFrame(receivedEntry("session", "s2", "server_event", "e-2", '{"other":1}'));
  noteSseFrame(receivedEntry("session", "s1", "server_event", "e-3", '{"type":"task_state"}'));
  noteSseFrame(receivedEntry("events", null, "server_event", "e-4", '{"type":"hello"}'));

  const html = render();
  expect(html).toContain(S.tracePanel.transportOn);
  expect(html).toContain(S.tracePanel.transportCount(3));
  expect(html).toContain("e-3");
  expect(html).not.toContain("other");
  expect(html).toContain(S.tracePanel.transportChannel);
  // Newest first: the last frame recorded is the first row rendered.
  expect(html.indexOf("hello")).toBeLessThan(html.indexOf("task_state"));
  expect(html.indexOf("task_state")).toBeLessThan(html.indexOf("ping"));
});
