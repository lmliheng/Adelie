/**
 * 端口选择里真正决定行为的那一步：能不能复用上次那个端口。
 *
 * 读/写那一半已经在 desktop.test.ts 里测过，这里只补 choosePort / isPortAvailable ——
 * 它们各自的判据不同：前者是「我能不能绑上」，后者是「绑不上就换一个」。
 */
import { createServer } from "node:net";
import type { Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { choosePort, findFreePort, isPortAvailable } from "../src/port-memory.js";

const held: Server[] = [];

/** 占住一个端口，模拟「上次记下的端口这次被别人用了」 */
function hold(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      held.push(server);
      resolve();
    });
  });
}

afterEach(() => {
  for (const server of held.splice(0)) server.close();
});

describe("端口可用性", () => {
  it("没人占用时回答「绑得上」", async () => {
    const port = await findFreePort();
    expect(await isPortAvailable(port)).toBe(true);
  });

  it("被占用时回答 false —— 这正是壳想知道的 EADDRINUSE", async () => {
    const port = await findFreePort();
    await hold(port);
    expect(await isPortAvailable(port)).toBe(false);
  });
});

describe("choosePort", () => {
  it("记过而且还能用时原样复用：界面的 origin 因此不变", async () => {
    const port = await findFreePort();
    expect(await choosePort({ lastPort: port })).toEqual({ port, reused: true });
  });

  it("记过的端口被占用时改让内核分配，并如实说「没复用」", async () => {
    const port = await findFreePort();
    await hold(port);

    const chosen = await choosePort({ lastPort: port });

    expect(chosen.reused).toBe(false);
    expect(chosen.port).not.toBe(port);
    expect(await isPortAvailable(chosen.port)).toBe(true);
  });

  it("第一次启动（没记过）也给一个可用端口", async () => {
    const chosen = await choosePort({ lastPort: null });

    expect(chosen.reused).toBe(false);
    expect(await isPortAvailable(chosen.port)).toBe(true);
  });
});
