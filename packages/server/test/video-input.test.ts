/**
 * Video input on the task and steer routes: `{type:"video_url"}` parts, and a steer's
 * `videos` field.
 *
 * - On a Session whose model takes video input (the Volcengine Ark Seed family — core's
 *   `catalogSupportsVideo`, or the Project's own `video` annotation for a model the catalog does
 *   not know), the clip rides inline as a user video message, which is the shape the provider's
 *   request is assembled from, and nothing is written to disk.
 * - On any other model it becomes an ordinary file attachment: the bytes land in the scratchpad
 *   and the Prompt gains an `[attached file: <path>]` line, so one composer draft is sendable
 *   to either kind of model instead of being refused for the model's choice.
 * - A part declared as a video has to carry a video data URL, and is capped at 32MB
 *   (413 `video_too_large`) — a document sent as a video is a 400 that names the field rather
 *   than a request the provider refuses three layers down. An http(s) video URL on a model that
 *   takes no video is refused too: there are no bytes to write.
 * - The steer route takes an inline video only where the model takes it (no model picker
 *   mid-run), and a recall hands it back as it was submitted.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  approvalDecision,
  assistantText,
  modelVisiblePath,
  saveProjectConfig,
  scratchpadDir,
  toolCall,
  userText,
} from "@adelie/core";
import type { ApproveFn, OmniMessage, VideoUrlPayload } from "@adelie/core";
import type { RuntimeSession } from "../src/runtime/session-manager.js";
import { INLINE_VIDEO_MAX_MB } from "../src/services/attachment-limits.js";
import { adoptSession, fakeSession, uniqueSessionId } from "./fixtures/session.js";
import { apiClient, createTestApp, provisionUser, waitFor } from "./helpers.js";
import type { TestApp } from "./helpers.js";

const PROJECT = "videer-default_project";
/** A model the catalog marks as taking video (ModelCatalogEntry.supportsVideo). */
const VIDEO_MODEL = { provider: "volcengine", modelId: "doubao-seed-2-1-pro-260915" };

/** The first bytes of an MP4 (`ftyp`), enough to compare byte for byte. */
const MP4 = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
const CLIP = `data:video/mp4;base64,${MP4.toString("base64")}`;

const dataUrl = (content: string, mime = "application/octet-stream") =>
  `data:${mime};base64,${Buffer.from(content).toString("base64")}`;

/** Fake Session that records each run's input and finishes immediately (no LLM, no approvals). */
function recordingFakeSession(sessionId: string, runs: OmniMessage[][]): RuntimeSession {
  return fakeSession(sessionId, {
    async *run(input: OmniMessage[]) {
      runs.push(input);
      yield assistantText("done");
    },
  });
}

/** Fake Session that parks on one approval (keeps the Task running) and records steer calls. */
function steeringFakeSession(sessionId: string, steered: OmniMessage[][]): RuntimeSession {
  return fakeSession(sessionId, {
    steer: (input: OmniMessage[]) => {
      steered.push(input);
      return true;
    },
    // Same contract as core: withdraw by input-list identity, false once "delivered".
    unsteer: (input: OmniMessage[]) => {
      const i = steered.indexOf(input);
      if (i < 0) return false;
      steered.splice(i, 1);
      return true;
    },
    async *run(_input: OmniMessage[], opts: { approve: ApproveFn; signal: AbortSignal }) {
      const tc = toolCall({ name: "exec_command", arguments: "{}", toolCallId: "tc-video" });
      yield tc;
      yield approvalDecision(await opts.approve(tc), "tc-video");
      yield assistantText("done");
    },
  });
}

/** The video message of a recorded input, or undefined. */
const videoOf = (input: OmniMessage[]): VideoUrlPayload | undefined =>
  input.find((m) => (m.payload as { type?: string }).type === "video_url")?.payload as
    VideoUrlPayload | undefined;

/** All text of a recorded input, joined the way the model would read it. */
const promptText = (input: OmniMessage[]): string =>
  input
    .map((m) => (m.payload as { text?: string }).text ?? "")
    .filter(Boolean)
    .join("\n");

const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

describe("video input", () => {
  let t: TestApp;
  let api: ReturnType<typeof apiClient>;
  let SID: string;
  let runs: OmniMessage[][];
  let dir: string;

  beforeAll(async () => {
    t = await createTestApp();
    api = apiClient(t.app, (await provisionUser(t.app, "videer")).cookie);
  });
  afterAll(async () => {
    await t.cleanup();
  });
  beforeEach(() => {
    SID = uniqueSessionId();
    runs = [];
    dir = path.join(scratchpadDir(t.root, PROJECT, "default_agent"), SID);
  });

  it("a video rides inline on a model that takes one, and writes nothing to disk", async () => {
    adoptSession(t.deps, recordingFakeSession(SID, runs), { projectId: PROJECT, ...VIDEO_MODEL });
    const res = await api.post(`/api/sessions/${SID}/tasks`, {
      input: [
        { type: "text", text: "what happens in this clip?" },
        { type: "video_url", videoUrl: CLIP, fileName: "clip.mp4" },
      ],
    });
    expect(res.status).toBe(202);
    await waitFor(() => runs.length === 1);

    expect(videoOf(runs[0]!)?.video_url).toBe(CLIP);
    // Inline means inline: no attachment line, no scratchpad copy — the clip is the message,
    // not a file the model has to open.
    expect(promptText(runs[0]!)).toBe("what happens in this clip?");
    expect(await fs.readdir(dir).catch(() => [])).toEqual([]);
  });

  it("a Project entry marked video rides inline even when the catalog never heard of the model", async () => {
    // The other half of the composer's own answer (`ModelInfo.video`): a row the user marked
    // `video = true` by hand. The catalog knows nothing about it, so the Project config is the
    // only place that says the model takes a clip — and if the two sides disagreed, the
    // composer would inline a video into a part the route would quietly file away instead.
    const own = { provider: "custom", modelId: "my-own-video-model" };
    await saveProjectConfig(t.root, PROJECT, {
      models: [
        { provider: own.provider, model_id: own.modelId, client_type: "openai-chat", video: true },
      ],
    });
    adoptSession(t.deps, recordingFakeSession(SID, runs), { projectId: PROJECT, ...own });
    const res = await api.post(`/api/sessions/${SID}/tasks`, {
      input: [
        { type: "text", text: "what happens in this clip?" },
        { type: "video_url", videoUrl: CLIP, fileName: "clip.mp4" },
      ],
    });
    expect(res.status).toBe(202);
    await waitFor(() => runs.length === 1);

    expect(videoOf(runs[0]!)?.video_url).toBe(CLIP);
    expect(await fs.readdir(dir).catch(() => [])).toEqual([]);
  });

  it("the same Project annotation lets a steered video ride inline", async () => {
    const own = { provider: "custom", modelId: "my-own-video-model" };
    await saveProjectConfig(t.root, PROJECT, {
      models: [{ provider: own.provider, model_id: own.modelId, video: true }],
    });
    const steered: OmniMessage[][] = [];
    adoptSession(t.deps, steeringFakeSession(SID, steered), {
      projectId: PROJECT,
      approvalMode: "always-ask",
      ...own,
    });
    await t.deps.manager.startTask(SID, [userText("go")]);
    await waitFor(() => t.deps.manager.pendingApprovalCount(SID) === 1);

    const posted = await api.post(`/api/sessions/${SID}/steer`, { videos: [CLIP] });
    expect(posted.status).toBe(202);
    expect(videoOf(steered[0]!)?.video_url).toBe(CLIP);
  });

  it("a video on a model without video input lands in the scratchpad as a file attachment", async () => {
    adoptSession(t.deps, recordingFakeSession(SID, runs), { projectId: PROJECT });
    const res = await api.post(`/api/sessions/${SID}/tasks`, {
      input: [
        { type: "text", text: "what happens in this clip?" },
        { type: "video_url", videoUrl: CLIP, fileName: "clip.mp4" },
      ],
    });
    expect(res.status).toBe(202);
    await waitFor(() => runs.length === 1);

    expect(videoOf(runs[0]!)).toBeUndefined();
    const filePath = /\[attached file: (.+)\]/.exec(promptText(runs[0]!))![1]!;
    expect(filePath).toBe(modelVisiblePath(path.join(dir, "clip.mp4")));
    expect(Buffer.from(await fs.readFile(filePath)).equals(MP4)).toBe(true);
  });

  it("names a nameless video after its own type, and refuses a non-video data URL", async () => {
    adoptSession(t.deps, recordingFakeSession(SID, runs), { projectId: PROJECT });
    const ok = await api.post(`/api/sessions/${SID}/tasks`, {
      input: [{ type: "video_url", videoUrl: CLIP }],
    });
    expect(ok.status).toBe(202);
    await waitFor(() => runs.length === 1);
    expect(path.basename(/\[attached file: (.+)\]/.exec(promptText(runs[0]!))![1]!)).toBe(
      "video.mp4",
    );

    const pdf = await api.post(`/api/sessions/${SID}/tasks`, {
      input: [{ type: "video_url", videoUrl: dataUrl("PDF-BYTES", "application/pdf") }],
    });
    expect(pdf.status).toBe(400);
    // The refusal names the offending field, so an API caller knows which part to fix.
    expect(await pdf.text()).toContain("input[0].videoUrl");
  });

  it("refuses an http(s) video on a model that takes none (nothing to write to disk)", async () => {
    adoptSession(t.deps, recordingFakeSession(SID, runs), { projectId: PROJECT });
    const res = await api.post(`/api/sessions/${SID}/tasks`, {
      input: [{ type: "video_url", videoUrl: "https://example.com/clip.mp4" }],
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("written to disk");
  });

  it("an inline video over its own cap is a 413, and the cap does not follow the attachment limit", async () => {
    adoptSession(t.deps, recordingFakeSession(SID, runs), { projectId: PROJECT, ...VIDEO_MODEL });
    // The video ceiling is fixed server-side (Ark takes a video under 50MB inside a 64MB body,
    // and base64 inflates by 4/3) — unlike the admin-settable file cap, because a video enters
    // the conversation and the Trace.
    const oversize = Buffer.alloc(INLINE_VIDEO_MAX_MB * 1024 * 1024 + 1).toString("base64");
    const res = await api.post(`/api/sessions/${SID}/tasks`, {
      input: [{ type: "video_url", videoUrl: `data:video/mp4;base64,${oversize}` }],
    });
    expect(res.status).toBe(413);
    expect(await errorCode(res)).toBe("video_too_large");
  });

  it("a steered video rides inline, carries the message alone, and comes back on recall", async () => {
    const steered: OmniMessage[][] = [];
    adoptSession(t.deps, steeringFakeSession(SID, steered), {
      projectId: PROJECT,
      approvalMode: "always-ask",
      ...VIDEO_MODEL,
    });
    await t.deps.manager.startTask(SID, [userText("go")]);
    await waitFor(() => t.deps.manager.pendingApprovalCount(SID) === 1);

    const posted = await api.post(`/api/sessions/${SID}/steer`, { videos: [CLIP] });
    expect(posted.status).toBe(202);
    expect(videoOf(steered[0]!)?.video_url).toBe(CLIP);
    const [info] = t.deps.manager.pendingSteeringOf(SID);
    expect(info).toEqual({
      id: expect.any(String),
      text: "",
      images: 0,
      videos: 1,
      files: 0,
    });

    const recalled = await api.delete(`/api/sessions/${SID}/steer/${info!.id}`);
    expect(recalled.status).toBe(200);
    expect(await recalled.json()).toEqual({ text: "", images: [], videos: [CLIP], files: [] });
  });

  it("a steered video on a model without video input is refused, not silently misdelivered", async () => {
    const steered: OmniMessage[][] = [];
    adoptSession(t.deps, steeringFakeSession(SID, steered), {
      projectId: PROJECT,
      approvalMode: "always-ask",
    });
    await t.deps.manager.startTask(SID, [userText("go")]);
    await waitFor(() => t.deps.manager.pendingApprovalCount(SID) === 1);

    const res = await api.post(`/api/sessions/${SID}/steer`, { videos: [CLIP] });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("file attachment");
    expect(steered).toEqual([]);
  });
});
