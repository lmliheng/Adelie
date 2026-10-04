// 可执行入口：`node dist/main.js` / `tsx src/main.ts`。
//
// 只做三件事：起服务、把地址（含 token）打给人看、把进程的收尾接到优雅关闭上。
import { startServer, isLoopbackHost } from './index.js';
import { readServerVersion } from './version.js';

const started = await startServer({
  // POST /api/shutdown 的处理链会先等运行中的轮次落盘，再走到这里退出进程
  onShutdown: () => {
    process.exit(0);
  },
});

console.log(`Adelie 后端已启动（v${readServerVersion()}）`);
console.log(`  地址   ${started.url}`);
console.log(`  监听   ${started.hostname}:${started.port}`);

if (started.token !== null) {
  console.log('  认证   请求需带 Authorization: Bearer <token> 或 ?token=<token>');
  console.log('         （token 已包含在上面的地址里，手机 / PWA 直接用那个 URL）');
} else if (isLoopbackHost(started.hostname)) {
  console.log('  认证   仅回环访问，无需 token；要给别的机器用请设 ADELIE_HOST 与 ADELIE_TOKEN');
}

if (process.env['ADELIE_WEB_DIST'] === undefined) {
  console.log('  前端   未设置 ADELIE_WEB_DIST，将按 packages/web/dist 查找构建产物');
}
