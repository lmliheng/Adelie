/**
 * The kit's checks: a stub Ark stands in for the real service, so the whole path — submit, poll,
 * download, name the file — runs here without an API key and without spending anything.
 *
 *   node --test plugins/use-seedance/test/
 *
 * What the stub proves is the script's own behaviour: that it reads the key from the environment
 * and sends it as a Bearer token, that it follows the documented status values to a terminal one,
 * that it bounds its polling, that it writes the bytes it downloaded and names them only once the
 * download finished, and that each failure path exits non-zero with the upstream text attached.
 * What it cannot prove is the shape of a REAL success response — that comes from the docs.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
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
  "seedance",
  "kit",
  "seedance.mjs",
);

/** A byte string standing in for an mp4: the test only cares that the bytes survive the trip. */
const VIDEO = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftypisom"),
  Buffer.from("a seedance video that never was\n"),
]);

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

/** The stub Ark: submit answers a task id, the first poll is running, the second succeeds. */
async function startStub({ statuses = ["running", "succeeded"], taskError } = {}) {
  // `authorizations` covers the API routes only: the video URL is fetched without a key, the
  // way a real task's signed URL is, so that it is recorded separately.
  const seen = {
    submits: 0,
    polls: 0,
    authorizations: [],
    bodies: [],
    videoAuthorization: undefined,
  };
  let poll = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://stub");
    if (url.pathname.startsWith("/api/v3")) seen.authorizations.push(req.headers.authorization);
    else seen.videoAuthorization = req.headers.authorization;
    const json = (code, value) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.method === "POST" && url.pathname === "/api/v3/contents/generations/tasks") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        seen.submits++;
        seen.bodies.push(JSON.parse(body));
        json(200, { id: "cgt-stub-0001" });
      });
      return;
    }
    if (
      req.method === "GET" &&
      url.pathname === "/api/v3/contents/generations/tasks/cgt-stub-0001"
    ) {
      seen.polls++;
      const status = statuses[Math.min(poll++, statuses.length - 1)];
      if (status === "succeeded")
        json(200, {
          id: "cgt-stub-0001",
          model: "doubao-seedance-2-5-260628",
          status,
          content: { video_url: `http://127.0.0.1:${server.address().port}/video.mp4` },
        });
      else json(200, { id: "cgt-stub-0001", status, error: taskError ?? null });
      return;
    }
    if (req.method === "GET" && url.pathname === "/video.mp4") {
      res.writeHead(200, { "content-type": "video/mp4", "content-length": String(VIDEO.length) });
      res.end(VIDEO);
      return;
    }
    json(404, { error: { code: "NotFound", message: "no such stub route" } });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}/api/v3`;
  // The kit's fetch keeps its connection alive, so closing the listener alone would wait for it:
  // drop the sockets too, or the run has to sit out undici's keep-alive timeout.
  const close = () => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  };
  return { server, origin, seen, close };
}

const execFileAsync = promisify(execFile);

/**
 * Runs the kit once, from a throwaway workspace so a default output path lands somewhere safe.
 * The child runs asynchronously on purpose: the stub lives in this process, and a blocking run
 * would leave it unable to answer, which is a hang rather than a failing test.
 */
async function run(args, { env = {}, workspace } = {}) {
  const dir = workspace ?? fs.mkdtempSync(path.join(os.tmpdir(), "seedance-test-"));
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

describe("the seedance kit", () => {
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

  it("demands a prompt, and refuses a value the service could only reject", async () => {
    assert.equal((await run([])).status, 2);
    const seeded = await run(["--prompt", "a cat", "--seed", "later"]);
    assert.equal(seeded.status, 2);
    assert.match(seeded.stderr, /"--seed" needs an integer, got "later"/);
    assert.equal((await run(["--prompt", "a cat", "--image"])).status, 2);
  });

  it("says what to do when ARK_API_KEY is missing, and never calls the API", async () => {
    const s = await stub();
    const { status, stderr } = await run(["--prompt", "a cat"], {
      env: { ARK_BASE_URL: s.origin },
    });
    assert.equal(status, 3);
    assert.match(stderr, /ARK_API_KEY is not set/);
    assert.match(stderr, /key vault/);
    assert.equal(s.seen.submits, 0);
  });

  it("submits, polls past a running status, downloads and names the file", async () => {
    const s = await stub();
    const { status, stdout, stderr, dir } = await run(
      [
        "--prompt",
        "一只猫打哈欠",
        "--out",
        "out/clip.mp4",
        "--duration",
        "5",
        "--watermark",
        "--poll-interval",
        "0.2",
      ],
      { env: { ARK_API_KEY: "stub-key", ARK_BASE_URL: s.origin } },
    );
    assert.equal(status, 0, stderr);
    const result = jsonLines(stdout).at(-1);
    assert.equal(result.ok, true);
    assert.equal(result.task_id, "cgt-stub-0001");
    assert.equal(result.bytes, VIDEO.length);
    assert.equal(result.model, "doubao-seedance-2-5-260628");
    assert.equal(typeof result.elapsed_ms, "number");
    // The download landed whole, byte for byte, under the requested name…
    const saved = path.join(dir, "out", "clip.mp4");
    assert.equal(sha(fs.readFileSync(saved)), sha(VIDEO));
    assert.equal(result.path, saved);
    // …with no leftover temporary file beside it.
    assert.deepEqual(fs.readdirSync(path.join(dir, "out")), ["clip.mp4"]);
    // The documented request shape, and the key sent as a bearer token on every call.
    assert.equal(s.seen.submits, 1);
    assert.deepEqual(s.seen.bodies[0], {
      model: "doubao-seedance-2-5-260628",
      content: [{ type: "text", text: "一只猫打哈欠" }],
      duration: 5,
      watermark: true,
    });
    assert.equal(s.seen.polls, 2);
    // One submit and two polls, each carrying the key as a bearer token.
    assert.deepEqual(s.seen.authorizations, [
      "Bearer stub-key",
      "Bearer stub-key",
      "Bearer stub-key",
    ]);
    // The task's video URL is a signed link: the key is not sent to it.
    assert.equal(s.seen.videoAuthorization, undefined);
  });

  it("sends reference images with their roles, inlining a local file", async () => {
    const s = await stub();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seedance-test-"));
    fs.writeFileSync(path.join(dir, "first.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const { status } = await run(
      [
        "--prompt",
        "a cat",
        "--image",
        "first.png",
        "--reference-image",
        "https://example.test/ref.jpg",
        "--poll-interval",
        "0.2",
      ],
      { env: { ARK_API_KEY: "stub-key", ARK_BASE_URL: s.origin }, workspace: dir },
    );
    assert.equal(status, 0);
    assert.deepEqual(s.seen.bodies[0].content, [
      { type: "text", text: "a cat" },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,iVBORw==" },
        role: "first_frame",
      },
      {
        type: "image_url",
        image_url: { url: "https://example.test/ref.jpg" },
        role: "reference_image",
      },
    ]);
  });

  it("carries the upstream error of a failed task and exits non-zero", async () => {
    const s = await stub({
      statuses: ["failed"],
      taskError: { code: "InvalidParameter.TaskTypeMismatch", message: "wrong task type" },
    });
    const { status, stderr } = await run(["--prompt", "a cat", "--poll-interval", "0.2"], {
      env: { ARK_API_KEY: "stub-key", ARK_BASE_URL: s.origin },
    });
    assert.equal(status, 5);
    const failure = jsonLines(stderr).at(-1);
    assert.equal(failure.error, "task_failed");
    assert.equal(failure.status, "failed");
    assert.equal(failure.error_code, "InvalidParameter.TaskTypeMismatch");
    assert.match(failure.message, /wrong task type/);
    assert.match(failure.upstream, /InvalidParameter.TaskTypeMismatch/);
  });

  it("gives up on a task that never finishes instead of polling forever", async () => {
    const s = await stub({ statuses: ["queued"] });
    const { status, stderr } = await run(
      ["--prompt", "a cat", "--poll-interval", "0.2", "--max-wait", "0.6"],
      { env: { ARK_API_KEY: "stub-key", ARK_BASE_URL: s.origin } },
    );
    assert.equal(status, 6);
    const failure = jsonLines(stderr).at(-1);
    assert.equal(failure.error, "timeout");
    assert.equal(failure.task_id, "cgt-stub-0001");
    assert.ok(s.seen.polls > 1 && s.seen.polls < 10, `polls: ${s.seen.polls}`);
  });

  it("reports a rejected key with the service's own words", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: { code: "AuthenticationError", message: "The API key in the request is invalid." },
        }),
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.add({
      close: () => {
        server.closeAllConnections();
        return new Promise((resolve) => server.close(resolve));
      },
    });
    const { status, stderr } = await run(["--prompt", "a cat"], {
      env: {
        ARK_API_KEY: "stub-key",
        ARK_BASE_URL: `http://127.0.0.1:${server.address().port}/api/v3`,
      },
    });
    assert.equal(status, 4);
    const failure = jsonLines(stderr).at(-1);
    assert.equal(failure.error, "api_error");
    assert.equal(failure.status, 401);
    assert.match(failure.upstream, /AuthenticationError/);
  });
});
