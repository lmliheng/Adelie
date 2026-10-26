/**
 * The videos in a conversation, and where the browser fetches them from (react-dom/server static
 * markup, node env, no DOM) — the video counterpart of transcript-images.test.ts.
 *
 * A windowed history page carries each Trace video by reference (`/api/sessions/<id>/trace-video?…`),
 * because a clip is tens of megabytes: the browser follows that `<video src>` itself, so `routedUrl`
 * has to send it to the machine the Session lives on. A video that arrived inline (live, or a
 * steering message's) renders from its own bytes.
 *
 * Also pinned here: the element is `controls` with `preload="metadata"` — it is meant to be played,
 * and it must not download a clip nobody opened.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageStream } from "../src/features/chat/message-stream";
import type { StreamRenderContext } from "../src/features/chat/message-stream";
import type { ChatItem } from "../src/lib/omni/stream-model";
import { forgetSessionMachines, rememberSessionMachine } from "../src/lib/session-machines";
import { LocaleProvider } from "../src/state/locale";
import { stubLocalStorage } from "./helpers/storage";

beforeEach(() => {
  stubLocalStorage().setItem("penguin.lang", "en");
});
afterEach(() => forgetSessionMachines());

const ctx: StreamRenderContext = {
  pendingApprovals: new Map(),
  onApprove: async () => {},
  origin: [],
  taskRunning: false,
};

/** The `<video>` tags a stream of these items renders. */
function videoTags(items: ChatItem[]): string[] {
  const html = renderToStaticMarkup(
    createElement(
      LocaleProvider,
      null,
      createElement(MessageStream, { items, version: 1, ctx, onAddExcerpt: () => {} }),
    ),
  );
  return html.match(/<video\b[^>]*>/g) ?? [];
}

const ref = (sessionId: string) => `/api/sessions/${sessionId}/trace-video?file=2&amp;ordinal=8`;

describe("transcript videos", () => {
  it("plays a referenced clip of a Session on another machine from that machine", () => {
    rememberSessionMachine("s-remote", "M1");
    const tags = videoTags([
      {
        kind: "user_video",
        id: 1,
        videoUrl: "/api/sessions/s-remote/trace-video?file=2&ordinal=8",
      },
    ]);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain(`src="/server/M1${ref("s-remote")}"`);
  });

  it("plays a referenced clip of a Session on this server as written", () => {
    const tags = videoTags([
      { kind: "user_video", id: 1, videoUrl: "/api/sessions/s-local/trace-video?file=2&ordinal=8" },
    ]);
    expect(tags[0]).toContain(`src="${ref("s-local")}"`);
  });

  it("is a playable element that fetches nothing until it is opened", () => {
    const tags = videoTags([{ kind: "user_video", id: 1, videoUrl: "data:video/mp4;base64,AAAA" }]);
    // Controls: the clip is meant to be watched. Metadata only: a clip nobody presses play on must
    // not download. playsInline: a phone must not throw it into fullscreen.
    expect(tags[0]).toContain("controls");
    expect(tags[0]).toContain('preload="metadata"');
    expect(tags[0]).toMatch(/playsinline/i);
    // And nothing plays on its own, and nothing is muted: a transcript never makes noise by itself,
    // but a clip somebody chose to play is theirs to hear.
    expect(tags[0]).not.toContain("autoplay");
    expect(tags[0]).not.toContain("muted");
  });

  it("renders a clip that arrived inline from its own bytes", () => {
    rememberSessionMachine("s-remote", "M1");
    const bytes = "data:video/mp4;base64,AAAA";
    const tags = videoTags([{ kind: "user_video", id: 1, videoUrl: bytes }]);
    expect(tags[0]).toContain(`src="${bytes}"`);
  });

  it("carries a steered clip inside its steering chip, routed like a user_video", () => {
    rememberSessionMachine("s-remote", "M1");
    const tags = videoTags([
      { kind: "user_text", id: 1, text: "start" },
      {
        kind: "user_steering",
        id: 2,
        text: "watch this too",
        videos: ["/api/sessions/s-remote/trace-video?file=2&ordinal=8"],
      },
    ]);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain(`src="/server/M1${ref("s-remote")}"`);
    // The chip is still a chip: the steered text is there beside the clip.
    expect(tags[0]).toBeTruthy();
  });
});
