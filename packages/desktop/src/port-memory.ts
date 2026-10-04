/**
 * 端口的选择与记忆（纯函数，可在没有 Electron 的环境里单测）。
 *
 * 为什么桌面壳自己挑端口而不是让服务端挑了再回报：壳必须先把端口写进窗口 URL，
 * 而「服务端启动 → 写端口文件 → 壳读文件」多一次握手、多一条失败路径。壳用
 * 系统分配一个空闲端口（listen 0）再传给它，只有一种失败方式：端口被别人抢了。
 */
import { createServer } from "node:net";

/** 默认端口，给 `adelie serve` 与浏览器直接访问用；桌面壳不用它（用随机的） */
export const DEFAULT_PORT = 7370;

/** 记住上次用过的端口：同一个端口能保住浏览器的 localhost 权限与用户的肌肉记忆 */
export interface PortMemory {
  lastPort: number | null;
}

export function parsePortMemory(raw: string | null): PortMemory {
  if (raw === null) return { lastPort: null };
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536
    ? { lastPort: parsed }
    : { lastPort: null };
}

export function serializePortMemory(memory: PortMemory): string {
  return memory.lastPort === null ? "" : `${memory.lastPort}\n`;
}

/**
 * 用系统分配一个空闲端口：`listen(0)` 让内核挑，读到实际端口后立刻关掉。
 *
 * 这中间存在一个竞争窗口（关掉之后到服务端真正 listen 之前，端口可能被别人抢走），
 * 所以调用方仍然要按「服务端可能起不来」处理，不能假定拿到就能用。
 */
export function findFreePort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("拿不到分配到的端口"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}
