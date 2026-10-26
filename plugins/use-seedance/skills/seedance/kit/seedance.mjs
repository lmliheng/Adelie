#!/usr/bin/env node
/**
 * Generate a video with Volcengine Ark's Doubao Seedance models and save it into the workspace.
 *
 * One non-interactive run: prompt in, mp4 out. It submits an asynchronous task, polls it until
 * the service reports a terminal status — `--max-wait` is a hard ceiling and the poll interval
 * backs off, so a queued task can never hang the call — then downloads the result through a
 * temporary file and renames it into place, so a half-written video never wears the final name.
 *
 *   node seedance.mjs --prompt "..." [--out video.mp4] [--model doubao-seedance-2-5-260628]
 *                     [--image <url|path>] [--last-frame <url|path>] [--reference-image <url|path>]
 *                     [--duration 5] [--ratio 16:9] [--resolution 720p] [--seed 11]
 *                     [--watermark] [--generate-audio] [--poll-interval 5] [--max-wait 900]
 *
 * Progress goes to stderr as plain lines; the outcome goes to stdout as ONE line of JSON, so a
 * caller can pipe stdout straight into a JSON reader. Every failure leaves a non-zero exit code
 * and carries the upstream error text in the JSON on stderr:
 *
 *   1 unexpected | 2 bad usage | 3 no API key | 4 the API refused the request
 *   5 the task ended badly | 6 the task did not finish in time | 7 the video did not download
 *
 * Credentials: `ARK_API_KEY` (a vault key — this script never writes a key to disk). The endpoint
 * comes from `ARK_BASE_URL` and defaults to the official one; the override exists so the script
 * can be pointed at a local stub, which is how its end-to-end path is tested without spending
 * anything.
 *
 * API reference: https://docs.volcengine.com/docs/ark/create-video-generation-task-api?lang=zh
 *                https://docs.volcengine.com/docs/ark/get-video-generation-task-api?lang=zh
 */
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** The official Ark endpoint; `ARK_BASE_URL` overrides it (see the header). */
const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
/** Doubao Seedance 2.5 — the current Seedance Model ID (docs: model-list / seedance-2-5). */
const DEFAULT_MODEL = "doubao-seedance-2-5-260628";
const DEFAULT_POLL_SECONDS = 5;
const MAX_POLL_SECONDS = 20;
const DEFAULT_MAX_WAIT_SECONDS = 900;
/** Task statuses that end a poll: `succeeded` is the good one, these are the rest. */
const FAILED_STATUSES = new Set(["failed", "cancelled", "expired"]);
/** Mime types for `--image` files handed to the API as a base64 data URL. */
const IMAGE_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

const EXIT = { unexpected: 1, usage: 2, key: 3, upstream: 4, task: 5, timeout: 6, download: 7 };

const USAGE = `Generate a video with Doubao Seedance and save it into the workspace.

  node seedance.mjs --prompt "..." [options]

  --prompt <text>            what the video should show (required)
  --out <path>               where to save the mp4 (default ./seedance-<timestamp>.mp4)
  --model <id>               Ark Model ID (default ${DEFAULT_MODEL})
  --image <url|path>         first-frame image, local file or http(s)/data URL
  --last-frame <url|path>    last-frame image (needs --image: the pair is 首尾帧)
  --reference-image <url|path>  reference image (repeatable; Seedance 2.5 全模态参考)
  --duration <seconds>       video length, e.g. 5 (model default when omitted)
  --ratio <ratio>            e.g. 16:9, 9:16, 1:1, adaptive
  --resolution <size>        e.g. 480p, 720p, 1080p
  --seed <integer>           fixed seed for a reproducible take
  --watermark                keep the service watermark
  --generate-audio           let the model generate the soundtrack
  --poll-interval <seconds>  first wait between polls (default ${DEFAULT_POLL_SECONDS}, backs off to ${MAX_POLL_SECONDS})
  --max-wait <seconds>       give up after this long (default ${DEFAULT_MAX_WAIT_SECONDS})
  --help                     print this text

Environment: ARK_API_KEY (required), ARK_BASE_URL (defaults to the official endpoint).`;

/** A bad command line: reported with the usage text, never guessed at. */
class UsageError extends Error {}

/** One option table, so an unknown or valueless option is an error rather than a silent no-op. */
const SPECS = {
  prompt: { takes: true },
  out: { takes: true },
  model: { takes: true },
  image: { takes: true, repeat: true },
  "last-frame": { takes: true, repeat: true },
  "reference-image": { takes: true, repeat: true },
  duration: { takes: true },
  ratio: { takes: true },
  resolution: { takes: true },
  seed: { takes: true },
  watermark: { takes: false },
  "generate-audio": { takes: false },
  "poll-interval": { takes: true },
  "max-wait": { takes: true },
  help: { takes: false },
};

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--")) throw new UsageError(`unexpected argument "${raw}"`);
    const eq = raw.indexOf("=");
    const name = eq === -1 ? raw.slice(2) : raw.slice(2, eq);
    const spec = SPECS[name];
    if (!spec) throw new UsageError(`unknown option "--${name}"`);
    if (!spec.takes) {
      if (eq !== -1) throw new UsageError(`"--${name}" takes no value`);
      values[name] = true;
      continue;
    }
    const inline = eq === -1 ? undefined : raw.slice(eq + 1);
    const value = inline ?? argv[i + 1];
    if (value === undefined || (inline === undefined && value.startsWith("--")))
      throw new UsageError(`"--${name}" needs a value`);
    if (inline === undefined) i++;
    if (spec.repeat) (values[name] ??= []).push(value);
    else values[name] = value;
  }
  return values;
}

/** Progress and diagnostics for a human; stdout stays reserved for the one JSON line. */
function say(text) {
  process.stderr.write(`${text}\n`);
}

function fail(code, error, extra = {}) {
  process.stderr.write(`${JSON.stringify({ ok: false, error, ...extra })}\n`);
  process.exit(code);
}

function numberArg(args, name, fallback) {
  const raw = args[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0)
    throw new UsageError(`"--${name}" needs a positive number, got "${raw}"`);
  return value;
}

/**
 * An image option as the API wants it: an http(s)/data URL is passed through, a local path is
 * read and inlined as a base64 data URL (the docs' 图生视频-base64编码 form).
 */
function imageFor(spec, option) {
  if (/^(?:https?|data):/i.test(spec)) return spec;
  const file = path.resolve(spec);
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch (err) {
    throw new UsageError(`"--${option}" cannot read ${file}: ${err.message}`);
  }
  const mime = IMAGE_MIME[path.extname(file).toLowerCase()] ?? "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/** Input content list: the prompt, then whichever images were asked for, each with its role. */
function buildContent(args) {
  const content = [{ type: "text", text: args.prompt }];
  const images = [
    ...(args.image ?? []).map((spec) => ({ option: "image", role: "first_frame", spec })),
    ...(args["last-frame"] ?? []).map((spec) => ({
      option: "last-frame",
      role: "last_frame",
      spec,
    })),
    ...(args["reference-image"] ?? []).map((spec) => ({
      option: "reference-image",
      role: "reference_image",
      spec,
    })),
  ];
  if (images.some((image) => image.role === "last_frame") && !(args.image ?? []).length)
    throw new UsageError(
      `"--last-frame" is the second of a pair: pass the first frame with "--image"`,
    );
  for (const image of images)
    content.push({
      type: "image_url",
      image_url: { url: imageFor(image.spec, image.option) },
      role: image.role,
    });
  return content;
}

/** An integer passthrough: a typo is a bad command line, not a body the service has to reject. */
function integerArg(args, name) {
  if (args[name] === undefined) return undefined;
  const value = Number(args[name]);
  if (!Number.isInteger(value))
    throw new UsageError(`"--${name}" needs an integer, got "${args[name]}"`);
  return value;
}

/** The task body: only the options actually given, so the service's own defaults stand. */
function buildBody(args, model, content) {
  const body = { model, content };
  const duration = integerArg(args, "duration");
  const seed = integerArg(args, "seed");
  if (duration !== undefined) body.duration = duration;
  if (args.ratio !== undefined) body.ratio = args.ratio;
  if (args.resolution !== undefined) body.resolution = args.resolution;
  if (seed !== undefined) body.seed = seed;
  if (args.watermark) body.watermark = true;
  if (args["generate-audio"]) body.generate_audio = true;
  return body;
}

/**
 * One JSON request, with the upstream body kept verbatim on failure: the API's own message is
 * what tells a caller whether this is a key, a quota or a parameter problem.
 */
async function apiJson(url, init, what) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    fail(EXIT.upstream, "unreachable", {
      message: `${what} failed: cannot reach ${url} — ${err.message}`,
      upstream: err.message,
    });
  }
  const text = await res.text();
  if (!res.ok)
    fail(EXIT.upstream, "api_error", {
      message: `${what} failed: HTTP ${res.status} from ${url}`,
      status: res.status,
      upstream: text,
    });
  try {
    return JSON.parse(text);
  } catch {
    fail(EXIT.upstream, "api_error", {
      message: `${what} failed: the service answered something that is not JSON`,
      status: res.status,
      upstream: text,
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (!args.prompt?.trim()) throw new UsageError(`"--prompt" is required`);
  const prompt = args.prompt.trim();

  // The command line is fully understood (and any bad value rejected) before anything is sent or
  // asked for: a typo should not look like a credential problem.
  const model = args.model ?? DEFAULT_MODEL;
  const pollSeconds = numberArg(args, "poll-interval", DEFAULT_POLL_SECONDS);
  const maxWaitMs = numberArg(args, "max-wait", DEFAULT_MAX_WAIT_SECONDS) * 1000;
  const body = buildBody(args, model, buildContent({ ...args, prompt }));
  const baseUrl = (process.env.ARK_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(baseUrl))
    throw new UsageError(`ARK_BASE_URL must be an http(s) URL, got "${baseUrl}"`);

  const apiKey = process.env.ARK_API_KEY?.trim();
  if (!apiKey)
    fail(EXIT.key, "missing_key", {
      message:
        "ARK_API_KEY is not set. Add it to this agent's key vault (the agent card's settings → key vault) — the key comes from the Ark console at https://ark.volcengine.com/region:cn-beijing/apikey — then run the task again.",
    });

  const startedAt = Date.now();
  say(`model ${model}, endpoint ${baseUrl}`);

  const submission = await apiJson(
    `${baseUrl}/contents/generations/tasks`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    },
    "creating the video generation task",
  );
  const taskId = submission?.id;
  if (typeof taskId !== "string" || taskId === "")
    fail(EXIT.upstream, "api_error", {
      message: "creating the video generation task failed: the answer carried no task id",
      upstream: JSON.stringify(submission),
    });
  say(`task ${taskId} submitted`);

  // Poll until the service reports a terminal status; the wait is bounded both ways — the whole
  // call by --max-wait, and the gap between polls by a backing-off interval up to MAX_POLL_SECONDS.
  let intervalMs = pollSeconds * 1000;
  for (let attempt = 1; ; attempt++) {
    const task = await apiJson(
      `${baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      { headers: { authorization: `Bearer ${apiKey}` } },
      `polling task ${taskId}`,
    );
    const status = typeof task?.status === "string" ? task.status : "unknown";
    say(`poll ${attempt}: ${status} (${Math.round((Date.now() - startedAt) / 1000)}s)`);

    if (status === "succeeded") {
      const videoUrl = task?.content?.video_url;
      if (typeof videoUrl !== "string" || videoUrl === "")
        fail(EXIT.task, "no_video_url", {
          message: `task ${taskId} succeeded but the answer carried no content.video_url`,
          task_id: taskId,
          upstream: JSON.stringify(task),
        });

      const out = path.resolve(
        args.out ?? `seedance-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.mp4`,
      );
      const part = `${out}.part-${process.pid}`;
      fs.mkdirSync(path.dirname(out), { recursive: true });
      say(`downloading into ${out}`);

      let video;
      try {
        video = await fetch(videoUrl);
      } catch (err) {
        fail(EXIT.download, "download_error", {
          message: `downloading the video failed: cannot reach the URL the task returned — ${err.message}`,
          task_id: taskId,
          video_url: videoUrl,
          upstream: err.message,
        });
      }
      if (!video.ok || video.body === null) {
        const raw = await video.text().catch(() => "");
        fail(EXIT.download, "download_error", {
          message: `downloading the video failed: HTTP ${video.status} from the URL the task returned`,
          task_id: taskId,
          video_url: videoUrl,
          upstream: raw,
        });
      }

      let bytes;
      try {
        await pipeline(Readable.fromWeb(video.body), fs.createWriteStream(part));
        bytes = fs.statSync(part).size;
        if (bytes === 0) throw new Error("the downloaded file is empty");
      } catch (err) {
        // The temporary file goes away with the failure: only a complete download gets renamed.
        fs.rmSync(part, { force: true });
        fail(EXIT.download, "download_error", {
          message: `saving the video failed: ${err.message}`,
          task_id: taskId,
          video_url: videoUrl,
          upstream: err.message,
        });
      }
      fs.renameSync(part, out);
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          path: out,
          bytes,
          task_id: taskId,
          model: task?.model ?? model,
          video_url: videoUrl,
          elapsed_ms: Date.now() - startedAt,
        })}\n`,
      );
      return 0;
    }

    if (FAILED_STATUSES.has(status))
      fail(EXIT.task, "task_failed", {
        message: `task ${taskId} ended as ${status}: ${task?.error?.message ?? "(no message)"}`,
        task_id: taskId,
        status,
        error_code: task?.error?.code ?? null,
        upstream: JSON.stringify(task),
      });

    const left = maxWaitMs - (Date.now() - startedAt);
    if (left <= 0)
      fail(EXIT.timeout, "timeout", {
        message: `task ${taskId} was still ${status} after ${Math.round(maxWaitMs / 1000)}s; it keeps running on the service — poll it later with GET ${baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`,
        task_id: taskId,
        status,
      });
    await sleep(Math.min(intervalMs, left));
    intervalMs = Math.min(intervalMs * 1.5, MAX_POLL_SECONDS * 1000);
  }
}

try {
  process.exitCode = await main();
} catch (err) {
  if (err instanceof UsageError) {
    process.stderr.write(`${err.message}\n\n${USAGE}\n`);
    process.stderr.write(
      `${JSON.stringify({ ok: false, error: "usage", message: err.message })}\n`,
    );
    process.exit(EXIT.usage);
  }
  fail(EXIT.unexpected, "unexpected", {
    message: err instanceof Error ? err.message : String(err),
    upstream: err instanceof Error ? (err.stack ?? err.message) : String(err),
  });
}
