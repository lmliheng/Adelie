#!/usr/bin/env node
/**
 * Generate images with Volcengine Ark's Doubao Seedream models and save them into the workspace.
 *
 * One non-interactive run: prompt in, images out. The endpoint is synchronous — a single POST
 * answers with the images themselves (either a URL to download or inline base64) — so unlike the
 * video API there is nothing to poll. Every file is written through a temporary path and renamed
 * only once it is complete, so a half-written image never wears the final name.
 *
 *   node seedream.mjs --prompt "..." [--out image.png] [--model doubao-seedream-5-0-pro-260628]
 *                     [--image <url|path>] [--size 2K] [--count 3] [--layers]
 *                     [--transparent] [--format png] [--seed 11] [--watermark]
 *
 * Progress goes to stderr as plain lines; the outcome goes to stdout as ONE line of JSON, so a
 * caller can pipe stdout straight into a JSON reader. Every failure leaves a non-zero exit code
 * and carries the upstream error text in the JSON on stderr:
 *
 *   1 unexpected | 2 bad usage | 3 no API key | 4 the API refused the request | 7 an image did not download
 *
 * Credentials: `ARK_API_KEY` (a vault key — this script never writes a key to disk). The endpoint
 * comes from `ARK_BASE_URL` and defaults to the official one; the override exists so the script
 * can be pointed at a local stub, which is how its end-to-end path is tested without spending
 * anything.
 *
 * API reference: https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh
 */
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** The official Ark endpoint; `ARK_BASE_URL` overrides it (see the header). */
const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
/** Doubao Seedream 5.0 Pro — the current Seedream Model ID (docs: model-list / seedream-5-0). */
const DEFAULT_MODEL = "doubao-seedream-5-0-pro-260628";
/** Reference images per request, and layers per decomposition, as the service defines them. */
const MAX_IMAGES = 14;
const MAX_COUNT = 15;
/** Size bounds in total pixels: 1280x720 below, 4096x4096 above. */
const MIN_PIXELS = 1280 * 720;
const MAX_PIXELS = 4096 * 4096;
/** Mime types for `--image` files handed to the API as a base64 data URL. */
const IMAGE_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

const EXIT = { unexpected: 1, usage: 2, key: 3, upstream: 4, download: 7 };

const USAGE = `Generate an image with Doubao Seedream and save it into the workspace.

  node seedream.mjs --prompt "..." [options]

  --prompt <text>            what the image should show (required)
  --out <path>               file to save to, or a directory when several images come back
                             (default ./seedream-<timestamp>)
  --model <id>               Ark Model ID (default ${DEFAULT_MODEL})
  --image <url|path>         reference image, repeatable up to ${MAX_IMAGES}; local file or http(s)/data URL
  --size <1K|2K|4K|WxH>      output size, e.g. 2K or 2048x2048
  --count <n>                a group of n images (1-${MAX_COUNT}) in one request
  --layers                   split the result into layers (one base image + up to 16 layers)
  --transparent              transparent background instead of an opaque one
  --format <png|jpeg>        output file format
  --seed <integer>           fixed seed for a reproducible take
  --watermark                keep the service watermark
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
  size: { takes: true },
  count: { takes: true },
  layers: { takes: false },
  transparent: { takes: false },
  format: { takes: true },
  seed: { takes: true },
  watermark: { takes: false },
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

/** An integer passthrough: a typo is a bad command line, not a body the service has to reject. */
function integerArg(args, name, { min, max } = {}) {
  if (args[name] === undefined) return undefined;
  const value = Number(args[name]);
  if (!Number.isInteger(value))
    throw new UsageError(`"--${name}" needs an integer, got "${args[name]}"`);
  if (min !== undefined && value < min)
    throw new UsageError(`"--${name}" needs at least ${min}, got "${args[name]}"`);
  if (max !== undefined && value > max)
    throw new UsageError(`"--${name}" accepts at most ${max}, got "${args[name]}"`);
  return value;
}

/**
 * An image option as the API wants it: an http(s)/data URL is passed through, a local path is
 * read and inlined as a base64 data URL (the docs' base64 form for reference images).
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

/**
 * A size the service will take: a named step is passed on as written, an explicit `WxH` is
 * checked against the pixel window here — a bad one is a command-line mistake, and the error says
 * which bound it broke instead of letting the service answer with a generic 400.
 */
function sizeArg(raw) {
  if (raw === undefined) return undefined;
  const named = /^(1k|2k|4k)$/i.exec(raw.trim());
  if (named) return named[1].toUpperCase();
  const dims = /^(\d+)x(\d+)$/i.exec(raw.trim());
  if (!dims) throw new UsageError(`"--size" needs 1K, 2K, 4K or <width>x<height>, got "${raw}"`);
  const width = Number(dims[1]);
  const height = Number(dims[2]);
  const pixels = width * height;
  if (pixels < MIN_PIXELS || pixels > MAX_PIXELS)
    throw new UsageError(
      `"--size" ${width}x${height} is ${pixels} pixels; the service accepts between ${MIN_PIXELS} (1280x720) and ${MAX_PIXELS} (4096x4096)`,
    );
  return `${width}x${height}`;
}

function formatArg(raw) {
  if (raw === undefined) return undefined;
  const value = raw.trim().toLowerCase();
  if (value !== "png" && value !== "jpeg")
    throw new UsageError(`"--format" needs png or jpeg, got "${raw}"`);
  return value;
}

/** The request body: only the options actually given, so the service's own defaults stand. */
function buildBody(args, model) {
  const images = (args.image ?? []).map((spec) => imageFor(spec, "image"));
  if (images.length > MAX_IMAGES)
    throw new UsageError(
      `"--image" accepts at most ${MAX_IMAGES} reference images, got ${images.length}`,
    );
  // The API takes a bare string for one reference image and an array for several.
  const body = {
    model,
    prompt: args.prompt,
    response_format: "url",
  };
  if (images.length === 1) body.image = images[0];
  else if (images.length > 1) body.image = images;
  const size = sizeArg(args.size);
  if (size !== undefined) body.size = size;
  const count = integerArg(args, "count", { min: 1, max: MAX_COUNT });
  if (count !== undefined) {
    // A group is the service's sequential generation filled to the requested number of images.
    body.sequential_image_generation = "auto";
    body.sequential_image_generation_options = { max_images: count };
  }
  if (args.layers) body.layer_decomposition = true;
  if (args.transparent) body.background = "transparent";
  const format = formatArg(args.format);
  if (format !== undefined) body.output_format = format;
  const seed = integerArg(args, "seed");
  if (seed !== undefined) body.seed = seed;
  if (args.watermark) body.watermark = true;
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
    return { answer: JSON.parse(text), headers: res.headers };
  } catch {
    fail(EXIT.upstream, "api_error", {
      message: `${what} failed: the service answered something that is not JSON`,
      status: res.status,
      upstream: text,
    });
  }
}

/** `[A-Za-z0-9._-]` survives, everything else becomes a dash; empty names fall back. */
function cleanName(raw, fallback) {
  const cleaned = String(raw ?? "")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return cleaned || fallback;
}

function zIndexOf(item) {
  return Number.isInteger(item?.z_index) ? item.z_index : undefined;
}

/**
 * File stems for a multi-image answer: a running number, the layer's z index when it has one,
 * and its name. The number keeps the order visible; the z index keeps the stacking readable.
 */
function planStems(items) {
  const used = new Map();
  return items.map((item, index) => {
    const z = zIndexOf(item);
    const stem = [
      String(index + 1).padStart(3, "0"),
      z === undefined ? undefined : `z${z}`,
      cleanName(item?.name, z === undefined ? "base" : "layer"),
    ]
      .filter(Boolean)
      .join("-");
    const seen = used.get(stem) ?? 0;
    used.set(stem, seen + 1);
    return seen === 0 ? stem : `${stem}-${seen + 1}`;
  });
}

/** Layers are always PNG; anything else follows the answer's format, then the request's. */
function extensionFor(item, format, isLayer) {
  if (isLayer) return "png";
  const value = String(item?.output_format ?? format ?? "png").toLowerCase();
  return value === "jpeg" || value === "jpg" ? "jpg" : "png";
}

/**
 * One image on disk, through a temporary file: an answer may carry a URL to fetch or the bytes
 * inline, and either way a partial write must not end up wearing the final name.
 */
async function saveItem(item, out) {
  const part = `${out}.part-${process.pid}`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try {
    if (typeof item?.b64_json === "string" && item.b64_json !== "") {
      fs.writeFileSync(part, Buffer.from(item.b64_json, "base64"));
    } else if (typeof item?.url === "string" && item.url !== "") {
      const res = await fetch(item.url);
      if (!res.ok || res.body === null)
        throw new Error(`HTTP ${res.status} from the URL the service returned`);
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(part));
    } else {
      throw new Error("the answer carried neither url nor b64_json");
    }
    if (fs.statSync(part).size === 0) throw new Error("the saved image is empty");
  } catch (err) {
    // The temporary file goes away with the failure: only a complete image gets renamed.
    fs.rmSync(part, { force: true });
    throw err;
  }
  fs.renameSync(part, out);
}

/** Answers often omit fields; keep only the ones that are actually there. */
function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (!args.prompt?.trim()) throw new UsageError(`"--prompt" is required`);
  args.prompt = args.prompt.trim();

  // The command line is fully understood (and any bad value rejected) before anything is sent or
  // asked for: a typo should not look like a credential problem.
  const model = args.model ?? DEFAULT_MODEL;
  const count = integerArg(args, "count", { min: 1, max: MAX_COUNT });
  const format = formatArg(args.format);
  const body = buildBody(args, model);
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

  const { answer, headers } = await apiJson(
    `${baseUrl}/images/generations`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    },
    "generating the image",
  );
  const items = Array.isArray(answer?.data) ? answer.data : [];
  if (items.length === 0)
    fail(EXIT.upstream, "api_error", {
      message: "generating the image failed: the answer carried no data",
      upstream: JSON.stringify(answer),
    });
  const requestId =
    (typeof answer?.request_id === "string" && answer.request_id) ||
    (typeof answer?.id === "string" && answer.id) ||
    headers.get("x-request-id") ||
    undefined;

  // A group request or a layer split answers several images, so `--out` names a directory then;
  // an answer that arrives with more images than asked for still gets its own files.
  const multi = Boolean(args.layers) || (count ?? 1) > 1 || items.length > 1;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  // A single image needs an extension to be openable, and that comes from the answer's format.
  const fallback = multi
    ? `seedream-${stamp}`
    : `seedream-${stamp}.${extensionFor(items[0], format, false)}`;
  const target = path.resolve(args.out ?? fallback);
  // Base image first, then the layers in stacking order: the numbering follows that order.
  const ordered = [...items].sort((a, b) => (zIndexOf(a) ?? -1) - (zIndexOf(b) ?? -1));
  const stems = multi ? planStems(ordered) : [];
  const paths = [];

  for (const [index, item] of ordered.entries()) {
    if (typeof item?.url !== "string" && typeof item?.b64_json !== "string")
      fail(EXIT.upstream, "api_error", {
        message: `generating the image failed: image ${index + 1} carried neither url nor b64_json`,
        upstream: JSON.stringify(item),
      });
    const isLayer = zIndexOf(item) !== undefined;
    const ext = extensionFor(item, format, isLayer);
    const out = multi ? path.join(target, `${stems[index]}.${ext}`) : target;
    say(`saving image ${index + 1}/${ordered.length} into ${out}`);
    try {
      await saveItem(item, out);
    } catch (err) {
      fail(EXIT.download, "download_error", {
        message: `saving image ${index + 1} failed: ${err.message}`,
        paths,
        upstream: err.message,
      });
    }
    paths.push(out);
  }

  const layers = multi
    ? ordered
        .map((item, index) => {
          const z = zIndexOf(item);
          if (z === undefined) return undefined;
          return compact({
            path: paths[index],
            z_index: z,
            name: item.name,
            size: item.size,
            bounding_box: item.bounding_box,
          });
        })
        .filter(Boolean)
    : [];

  const result = compact({
    ok: true,
    model: answer?.model ?? model,
    size: body.size ?? items[0]?.size,
    request_id: requestId,
    elapsed_ms: Date.now() - startedAt,
    paths,
    layers: layers.length ? layers : undefined,
    usage: answer?.usage,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return 0;
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
