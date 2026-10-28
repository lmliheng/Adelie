/**
 * The kit's checks: a stub Ark stands in for the real service, so the whole path — request,
 * download or base64 decode, name the files — runs here without an API key and without spending
 * anything.
 *
 *   node --test plugins/use-seedream/test/
 *
 * What the stub proves is the script's own behaviour: that it reads the key from the environment
 * and sends it as a Bearer token, that it builds the documented request body (reference images,
 * groups, layer decomposition), that it follows the documented answer shape for both `url` and
 * `b64_json`, that it writes bytes whole and names them only once the write finished, and that
 * each failure path exits with the code it promises and the upstream text attached.
 * What it cannot prove is the shape of a REAL success response — that comes from the docs.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { after, describe, it } from "node:test";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "skills",
  "seedream",
  "kit",
  "seedream.mjs",
);

const MODEL = "doubao-seedream-5-0-pro-260628";

/** Distinct bytes per stub image, so the tests can tell which file holds which answer. */
const bytesFor = (name) => Buffer.from(`a stub image named ${name} that never was\n`);

/**
 * The stub Ark: one POST answers with whatever the test asked for, and every `/img/<name>` path
 * serves the bytes `bytesFor(name)` so a download can be traced back to its item.
 */
async function startStub({ status = 200, answer } = {}) {
  // `imageAuthorization` covers the download requests only: a real answer's URL is a signed link,
  // so the API key must not travel to it, and that is what this records.
  const seen = { posts: 0, bodies: [], authorizations: [], imageAuthorization: undefined };
  let root = "";
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://stub");
    const json = (code, value) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.method === "POST" && url.pathname === "/api/v3/images/generations") {
      seen.authorizations.push(req.headers.authorization);
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        seen.posts++;
        seen.bodies.push(JSON.parse(body));
        json(status, answer(seen, root));
      });
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/img/")) {
      seen.imageAuthorization = req.headers.authorization;
      const bytes = bytesFor(url.pathname.slice("/img/".length));
      res.writeHead(200, { "content-type": "image/png", "content-length": String(bytes.length) });
      res.end(bytes);
      return;
    }
    json(404, { error: { code: "NotFound", message: "no such stub route" } });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  root = `http://127.0.0.1:${server.address().port}`;
  const origin = `${root}/api/v3`;
  // The kit's fetch keeps its connection alive, so closing the listener alone would wait for it:
  // drop the sockets too, or the run has to sit out undici's keep-alive timeout.
  const close = () => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  };
  return { server, origin, seen, close };
}

/** One answer image per stub file name, as the `url` form of the documented response. */
const urlItems = (root, names) => ({
  model: MODEL,
  data: names.map((name) => ({
    url: `${root}/img/${name}.png`,
    size: "2048x2048",
    output_format: "png",
  })),
  usage: { generated_images: names.length },
});

const execFileAsync = promisify(execFile);

/**
 * Runs the kit once, from a throwaway workspace so a default output path lands somewhere safe.
 * The child runs asynchronously on purpose: the stub lives in this process, and a blocking run
 * would leave it unable to answer, which is a hang rather than a failing test.
 */
async function run(args, { env = {}, workspace } = {}) {
  // The child resolves a relative `--out` against its own cwd, and the OS reports that as the real
  // path — on macOS a tmpdir of /var/… comes back as /private/var/… — so hand the real one back and
  // let the callers compare against the same thing.
  const dir = fs.realpathSync(
    workspace ?? fs.mkdtempSync(path.join(os.tmpdir(), "seedream-test-")),
  );
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [SCRIPT, ...args], {
      cwd: dir,
      encoding: "utf8",
      env: { PATH: process.env.PATH, ...env },
    });
    return { status: 0, stdout, stderr, dir };
  } catch (err) {
    return { status: err.code ?? -1, stdout: err.stdout ?? "", stderr: err.stderr ?? "", dir };
  }
}

/** The JSON lines of a stream: progress and usage text are plain lines and are skipped here. */
const jsonLines = (text) =>
  text
    .split("\n")
    .filter((line) => line.startsWith("{") && line.endsWith("}"))
    .map((line) => JSON.parse(line));

describe("the seedream kit", () => {
  const servers = new Set();
  const stub = async (options) => {
    const s = await startStub(options);
    servers.add(s);
    return s;
  };
  after(async () => {
    for (const s of servers) await s.close();
  });

  it("reports a bad command line instead of guessing at it", async () => {
    const { status, stderr, stdout } = await run(["--prompt", "a cat", "--bogus", "1"]);
    assert.equal(status, 2);
    assert.equal(stdout, "");
    assert.match(stderr, /unknown option "--bogus"/);
    assert.deepEqual(jsonLines(stderr).at(-1), {
      ok: false,
      error: "usage",
      message: 'unknown option "--bogus"',
    });
  });

  it("demands a prompt, and refuses values the service could only reject", async () => {
    assert.equal((await run([])).status, 2);
    const seeded = await run(["--prompt", "a cat", "--seed", "later"]);
    assert.equal(seeded.status, 2);
    assert.match(seeded.stderr, /"--seed" needs an integer, got "later"/);
    assert.equal((await run(["--prompt", "a cat", "--image"])).status, 2);
    // 1280x720 is the lower bound on total pixels, 4096x4096 the upper one.
    const tiny = await run(["--prompt", "a cat", "--size", "640x480"]);
    assert.equal(tiny.status, 2);
    assert.match(tiny.stderr, /"--size" 640x480 is 307200 pixels/);
    const huge = await run(["--prompt", "a cat", "--size", "5000x5000"]);
    assert.equal(huge.status, 2);
    assert.match(huge.stderr, /accepts between 921600 \(1280x720\) and 16777216/);
    assert.equal((await run(["--prompt", "a cat", "--format", "webp"])).status, 2);
    assert.equal((await run(["--prompt", "a cat", "--count", "16"])).status, 2);
  });

  it("refuses a fifteenth reference image before anything is sent", async () => {
    const images = Array.from({ length: 15 }, (_, i) => [
      "--image",
      `https://example.test/${i}.png`,
    ]);
    const { status, stderr } = await run(["--prompt", "a cat", ...images.flat()]);
    assert.equal(status, 2);
    assert.match(stderr, /"--image" accepts at most 14 reference images, got 15/);
  });

  it("says what to do when ARK_API_KEY is missing, and never calls the API", async () => {
    const s = await stub({ answer: (_seen, root) => urlItems(root, ["one"]) });
    const { status, stderr } = await run(["--prompt", "a cat"], {
      env: { ARK_BASE_URL: s.origin },
    });
    assert.equal(status, 3);
    assert.match(stderr, /ARK_API_KEY is not set/);
    assert.match(stderr, /key vault/);
    assert.equal(s.seen.posts, 0);
  });

  it("generates one image, downloads it, and prints one line of JSON", async () => {
    const s = await stub({ answer: (_seen, root) => urlItems(root, ["one"]) });
    const { status, stdout, stderr, dir } = await run(
      ["--prompt", "一只猫晒太阳", "--out", "out/cat.png", "--size", "2K", "--watermark"],
      { env: { ARK_API_KEY: "stub-key", ARK_BASE_URL: s.origin } },
    );
    assert.equal(status, 0, stderr);
    const result = jsonLines(stdout).at(-1);
    assert.equal(result.ok, true);
    assert.equal(result.model, MODEL);
    assert.equal(result.size, "2K");
    assert.deepEqual(result.usage, { generated_images: 1 });
    assert.equal(typeof result.elapsed_ms, "number");
    // The download landed whole, under the requested name…
    const saved = path.join(dir, "out", "cat.png");
    assert.deepEqual(result.paths, [saved]);
    assert.deepEqual(fs.readFileSync(saved), bytesFor("one.png"));
    // …with no leftover temporary file beside it.
    assert.deepEqual(fs.readdirSync(path.join(dir, "out")), ["cat.png"]);
    // The documented request shape, and the key sent as a bearer token.
    assert.equal(s.seen.posts, 1);
    assert.deepEqual(s.seen.bodies[0], {
      model: MODEL,
      prompt: "一只猫晒太阳",
      size: "2K",
      watermark: true,
      response_format: "url",
    });
    assert.deepEqual(s.seen.authorizations, ["Bearer stub-key"]);
    // An answer URL is a signed link: the key is not sent to it.
    assert.equal(s.seen.imageAuthorization, undefined);
  });

  it("writes an inline base64 answer to disk too", async () => {
    const bytes = bytesFor("inline.png");
    const s = await stub({
      answer: () => ({
        model: MODEL,
        data: [{ b64_json: bytes.toString("base64"), output_format: "png" }],
      }),
    });
    const { status, stdout, dir } = await run(["--prompt", "a cat", "--out", "inline.png"], {
      env: { ARK_API_KEY: "stub-key", ARK_BASE_URL: s.origin },
    });
    assert.equal(status, 0);
    const result = jsonLines(stdout).at(-1);
    assert.deepEqual(fs.readFileSync(path.join(dir, "inline.png")), bytes);
    assert.deepEqual(result.paths, [path.join(dir, "inline.png")]);
  });

  it("asks for a group of three with sequential generation, and names them in a directory", async () => {
    const s = await stub({ answer: (_seen, root) => urlItems(root, ["g1", "g2", "g3"]) });
    const { status, stdout, dir } = await run(
      ["--prompt", "a cat", "--count", "3", "--out", "group"],
      { env: { ARK_API_KEY: "stub-key", ARK_BASE_URL: s.origin } },
    );
    assert.equal(status, 0);
    const body = s.seen.bodies[0];
    assert.equal(body.sequential_image_generation, "auto");
    assert.deepEqual(body.sequential_image_generation_options, { max_images: 3 });
    assert.equal(body.layer_decomposition, undefined);
    const result = jsonLines(stdout).at(-1);
    assert.deepEqual(
      result.paths.map((p) => path.relative(dir, p)),
      ["group/001-base.png", "group/002-base.png", "group/003-base.png"],
    );
    assert.deepEqual(fs.readdirSync(path.join(dir, "group")).sort(), [
      "001-base.png",
      "002-base.png",
      "003-base.png",
    ]);
    assert.deepEqual(fs.readFileSync(path.join(dir, "group", "002-base.png")), bytesFor("g2.png"));
    assert.equal(result.layers, undefined);
  });

  it("splits into layers, naming each by its z index with the base image first", async () => {
    const s = await stub({
      answer: (_seen, root) => ({
        model: MODEL,
        data: [
          { url: `${root}/img/base.png`, size: "2048x2048", output_format: "png" },
          {
            url: `${root}/img/back.png`,
            z_index: 1,
            name: "背景",
            description: "the whole background",
            output_format: "png",
            bounding_box: {
              absolute: { x: 0, y: 0, width: 2048, height: 2048 },
              normalized: { x: 0, y: 0, width: 1, height: 1 },
            },
          },
          {
            url: `${root}/img/cat.png`,
            z_index: 0,
            name: "cat outline",
            description: "the cat",
            output_format: "png",
            bounding_box: {
              absolute: { x: 100, y: 200, width: 300, height: 400 },
              normalized: { x: 0.05, y: 0.1, width: 0.15, height: 0.2 },
            },
          },
        ],
      }),
    });
    const { status, stdout, dir } = await run(
      ["--prompt", "a cat", "--layers", "--out", "layers"],
      { env: { ARK_API_KEY: "stub-key", ARK_BASE_URL: s.origin } },
    );
    assert.equal(status, 0);
    assert.equal(s.seen.bodies[0].layer_decomposition, true);
    const result = jsonLines(stdout).at(-1);
    // Base first, then z0, then z1 — the running number follows the stacking order…
    assert.deepEqual(
      result.paths.map((p) => path.relative(dir, p)),
      ["layers/001-base.png", "layers/002-z0-cat-outline.png", "layers/003-z1-layer.png"],
    );
    // …and the Chinese layer name cleans to nothing, so the fallback stands in for it.
    assert.deepEqual(fs.readdirSync(path.join(dir, "layers")).sort(), [
      "001-base.png",
      "002-z0-cat-outline.png",
      "003-z1-layer.png",
    ]);
    assert.deepEqual(
      fs.readFileSync(path.join(dir, "layers", "002-z0-cat-outline.png")),
      bytesFor("cat.png"),
    );
    // The JSON repeats the layers in z order, with their names and boxes.
    assert.deepEqual(
      result.layers.map((layer) => [layer.z_index, layer.name]),
      [
        [0, "cat outline"],
        [1, "背景"],
      ],
    );
    assert.deepEqual(result.layers[0].bounding_box, {
      absolute: { x: 100, y: 200, width: 300, height: 400 },
      normalized: { x: 0.05, y: 0.1, width: 0.15, height: 0.2 },
    });
    assert.equal(result.layers[0].path, path.join(dir, "layers", "002-z0-cat-outline.png"));
  });

  it("inlines a local reference image as a data URL", async () => {
    const s = await stub({ answer: (_seen, root) => urlItems(root, ["one"]) });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seedream-test-"));
    fs.writeFileSync(path.join(dir, "first.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const { status } = await run(["--prompt", "a cat", "--image", "first.png"], {
      env: { ARK_API_KEY: "stub-key", ARK_BASE_URL: s.origin },
      workspace: dir,
    });
    assert.equal(status, 0);
    assert.equal(s.seen.bodies[0].image, "data:image/png;base64,iVBORw==");
  });

  it("carries the service's own words when the request is refused", async () => {
    const s = await stub({
      status: 404,
      answer: () => ({ error: { code: "NotFound", message: "the model does not exist" } }),
    });
    const { status, stdout, stderr } = await run(["--prompt", "a cat"], {
      env: { ARK_API_KEY: "stub-key", ARK_BASE_URL: s.origin },
    });
    assert.equal(status, 4);
    assert.equal(stdout, "");
    const failure = jsonLines(stderr).at(-1);
    assert.equal(failure.error, "api_error");
    assert.equal(failure.status, 404);
    assert.match(failure.upstream, /the model does not exist/);
  });
});
