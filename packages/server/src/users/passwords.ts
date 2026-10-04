// 口令哈希：scrypt + 随机盐，比对用常数时间。
//
// 为什么不存明文、也不存「加盐 MD5」这类做法：用户表落在 `~/.adelie/adelie.db`，
// 而 `~/.adelie` 里还有会话事件流、密钥文件 —— 它会被备份、被同步、被随手拷走。
// 口令哈希是那种「今天多写二十行、以后省掉一次通报」的东西。
//
// 用 node:crypto 自带的 scrypt：不引依赖（零原生模块，Windows 上装得上），
// 参数写进哈希串本身，将来调参不会让老哈希失效。

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** scrypt 参数：N 是 CPU/内存代价，r/p 是块与并行度。这组是 Node 文档的推荐值 */
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_BYTES = 64;
const SALT_BYTES = 16;
const PREFIX = 'scrypt';

/** 哈希串形如 `scrypt$16384$8$1$<salt b64>$<key b64>` —— 参数自带，将来好换 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(plain, salt, KEY_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return [
    PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/**
 * 比对口令。
 *
 * 存储值形状不对（NULL、空串、人手改坏的）一律返回 false，而不是抛异常 ——
 * 这条路径会被人拿浏览器反复敲，抛异常等于给对方一个比 401 更响的信号。
 */
export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (stored === null || stored === undefined || stored === '') return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const n = Number.parseInt(parts[1]!, 10);
  const r = Number.parseInt(parts[2]!, 10);
  const p = Number.parseInt(parts[3]!, 10);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    // maxmem 要跟着 N 走：默认上限会把 N=16384 直接顶回来（这是踩过的坑）
    actual = scryptSync(plain, salt, expected.length, { N: n, r, p, maxmem: 256 * n * r });
  } catch {
    return false;
  }

  // 长度不等时 timingSafeEqual 会抛，所以先比长度 —— 而长度本身不是秘密
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** 会话令牌：128 位随机。它只以 sha256 的形式落库（见 db.ts），原文只在 Cookie 里 */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 用户 id：16 位十六进制。它要当目录名（会话分区）与文件名（密钥），所以只留安全字符 */
export function newUserId(): string {
  return randomBytes(8).toString('hex');
}
