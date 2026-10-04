/**
 * 桌面壳里能在没有 Electron 的环境下测的那些决定：端口怎么记、产物在哪。
 * （main.ts / server-process.ts 直接 import electron，测不了 —— 所以那些判断都被
 * 抽到了这里，而不是留在主流程里。）
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findFreePort, parsePortMemory, serializePortMemory } from '../src/port-memory.js';
import { missingBuildPieces, serverEntryPath, webDistFor } from '../src/web-dist.js';

describe('端口记忆', () => {
  it('空文件 / 垃圾内容都退回「没记过」，而不是当成 0 端口', () => {
    expect(parsePortMemory(null)).toEqual({ lastPort: null });
    expect(parsePortMemory('')).toEqual({ lastPort: null });
    expect(parsePortMemory('abc')).toEqual({ lastPort: null });
    expect(parsePortMemory('70000')).toEqual({ lastPort: null });
    expect(parsePortMemory('-1')).toEqual({ lastPort: null });
  });

  it('记得住的端口原样读回，并且写出去的是可再读的一行', () => {
    expect(parsePortMemory('7370\n')).toEqual({ lastPort: 7370 });
    expect(serializePortMemory({ lastPort: 7370 })).toBe('7370\n');
    expect(serializePortMemory({ lastPort: null })).toBe('');
  });

  it('能向内核要到一个可用的端口', async () => {
    const port = await findFreePort();
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(1023);
    expect(port).toBeLessThan(65536);
  });
});

describe('产物定位', () => {
  const desktop = { isPackaged: false, appPath: '/app/desktop', desktopDist: '/app/desktop/dist' };

  it('源码运行：服务端与 Web 都指回工作区里的兄弟包', () => {
    expect(serverEntryPath(desktop)).toBe(path.join('/app', 'server', 'dist', 'main.js'));
  });

  it('打包后：服务端在 app 的 dist 下，Web 产物在 app 的 web-dist 下', () => {
    const packaged = { isPackaged: true, appPath: '/app', desktopDist: '/app/dist' };
    expect(serverEntryPath(packaged)).toBe(path.join('/app', 'dist', 'server.js'));
    expect(webDistFor(packaged)).toBeNull(); // 目录不存在时是 null，不是一条注定 404 的路径
  });

  it('Web 产物存在才算数，且缺什么要能一次说清', () => {
    // 造一个「有 index.html 的 web/dist」与一个「没有服务端产物」的目录树
    const root = mkdtempSync(path.join(tmpdir(), 'adelie-desktop-'));
    const desktopDist = path.join(root, 'desktop', 'dist');
    mkdirSync(path.join(root, 'web', 'dist'), { recursive: true });
    writeFileSync(path.join(root, 'web', 'dist', 'index.html'), '<!doctype html>');
    const input = { isPackaged: false, appPath: path.join(root, 'desktop'), desktopDist };

    expect(webDistFor(input)).toBe(path.join(root, 'web', 'dist'));
    expect(missingBuildPieces(input)).toEqual(['服务端产物（packages/server/dist/main.js）']);
  });
});
