// 用户与会话归属的库（`~/.adelie/adelie.db`，SQLite）。
//
// 为什么是 SQLite 而不是又一个 JSON 文件：
//   1. 「谁拥有哪个会话」要在**每次读会话**时回答（不能信任请求里带的 id），
//      这是一次按主键的查表，不是一次手写的文件扫描；
//   2. 并发。CLI 与桌面壳同时开着是常态，JSON 文件的读-改-写会丢更新；
//   3. 口令哈希、令牌过期这类东西不该住在事件流里（事件流是 append-only 的对话记录）。
//
// 为什么用 node:sqlite 而不是 better-sqlite3：零原生模块。这个应用的发布形态是
// npm 包 + Windows 安装包 + PWA，多一个要编译的原生依赖就多一类装不上的机器。
//
// 这里只放**索引与账号**两种数据。会话的正文仍然是事件流（`events.jsonl`），
// 本库里的 `sessions` 表只是「这个会话属于谁、在哪个工作区」的索引 ——
// 它可以随时由磁盘重建（见 syncSessionsFromDisk）。

import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { adelieHome } from 'adelie-core';

import { hashPassword, newToken, newUserId, verifyPassword } from './passwords.js';

/** 覆盖库文件位置的环境变量。用途与 `ADELIE_SESSIONS_ROOT` 相同：测试要写到临时目录 */
export const DB_FILE_ENV = 'ADELIE_DB_FILE';

/** 内置管理员的 id。固定成 'admin' 是为了让播种幂等，也让人一眼看懂 */
export const ADMIN_ID = 'admin';

/** 登录态有效期：30 天。桌面与手机上的「一直登着」靠它 */
const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 当前 schema 版本。加字段时改它，并在 migrate() 里补一段向前迁移 */
const SCHEMA_VERSION = 1;

export function usersDbFile(override?: string): string {
  return override ?? process.env[DB_FILE_ENV] ?? join(adelieHome(), 'adelie.db');
}

export interface UserRow {
  id: string;
  name: string;
  isAdmin: boolean;
  /** 有没有口令。内置 admin 初始没有 —— 它靠「本机就是管理员」这条公理进门 */
  hasPassword: boolean;
  createdAt: number;
}

export interface SessionOwnerRow {
  sessionId: string;
  userId: string;
  workspace: string;
  createdAt: number;
}

interface UserRecord {
  id: string;
  name: string;
  password_hash: string | null;
  is_admin: number;
  created_at: number;
}

function toUser(row: UserRecord): UserRow {
  return {
    id: row.id,
    name: row.name,
    isAdmin: row.is_admin === 1,
    hasPassword: row.password_hash !== null && row.password_hash !== '',
    createdAt: row.created_at,
  };
}

export class UserStore {
  private readonly db: DatabaseSync;

  constructor(file: string = usersDbFile()) {
    mkdirSync(dirname(file), { recursive: true });
    // busy_timeout：CLI、桌面壳、网页三个进程同时开着是常态，撞上写锁时等一会儿
    // 而不是立刻抛「database is locked」——那个报错对用户来说等于「应用坏了」。
    this.db = new DatabaseSync(file, { timeout: 5000 });
    // 外键约束默认是关的：不打开它，删号之后 auth_sessions 里会留下指向不存在用户的令牌
    this.db.exec('PRAGMA foreign_keys = ON');
    this.migrate();
    this.seedAdmin();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        is_admin      INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        workspace  TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        json    TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    `);
    this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  /**
   * 播种内置管理员。
   *
   * 口令是空的：这台机器上能读到 `~/.adelie` 的人就是管理员（桌面壳与 CLI 都在这条路上），
   * 让他先设一个口令才能用，等于给单机用户凭空加一道登录墙。等他要从手机连进来时，
   * 再由自己（或管理员）给这个账号设口令 —— 见 `setPassword`。
   */
  private seedAdmin(): void {
    this.db
      .prepare('INSERT OR IGNORE INTO users (id, name, password_hash, is_admin, created_at) VALUES (?, ?, NULL, 1, ?)')
      .run(ADMIN_ID, 'admin', Date.now());
  }

  // ---- 账号 ----

  listUsers(): UserRow[] {
    const rows = this.db
      .prepare('SELECT id, name, password_hash, is_admin, created_at FROM users ORDER BY created_at')
      .all() as unknown as UserRecord[];
    return rows.map(toUser);
  }

  findUser(id: string): UserRow | undefined {
    const row = this.db
      .prepare('SELECT id, name, password_hash, is_admin, created_at FROM users WHERE id = ?')
      .get(id) as unknown as UserRecord | undefined;
    return row === undefined ? undefined : toUser(row);
  }

  findUserByName(name: string): UserRow | undefined {
    const row = this.db
      .prepare('SELECT id, name, password_hash, is_admin, created_at FROM users WHERE name = ?')
      .get(name) as unknown as UserRecord | undefined;
    return row === undefined ? undefined : toUser(row);
  }

  createUser(input: { name: string; password: string | null; isAdmin: boolean }): UserRow {
    const id = newUserId();
    const now = Date.now();
    this.db
      .prepare('INSERT INTO users (id, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, input.name, input.password === null ? null : hashPassword(input.password), input.isAdmin ? 1 : 0, now);
    return { id, name: input.name, isAdmin: input.isAdmin, hasPassword: input.password !== null, createdAt: now };
  }

  /** 删号。返回是否真的删到；内置 admin 不允许删（调用方拦，这里再兜一层） */
  deleteUser(id: string): boolean {
    if (id === ADMIN_ID) return false;
    const user = this.findUser(id);
    if (user === undefined) return false;
    // auth_sessions 有 ON DELETE CASCADE，但外键只在 PRAGMA 开着时生效 —— 手删一次更稳
    this.db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    this.db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(id);
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return true;
  }

  /** 设口令；`null` 表示清掉口令（此后只能靠本机或管理员进门） */
  setPassword(id: string, password: string | null): boolean {
    if (this.findUser(id) === undefined) return false;
    this.db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(password === null ? null : hashPassword(password), id);
    if (password === null) {
      // 口令没了，之前发出去的登录态就该一起作废 —— 否则「清了口令」只是关了一半门
      this.db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(id);
    }
    return true;
  }

  setAdmin(id: string, isAdmin: boolean): boolean {
    if (id === ADMIN_ID) return false;
    if (this.findUser(id) === undefined) return false;
    this.db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, id);
    return true;
  }

  /** 口令登录。失败一律返回 null（不区分「没有这个用户」与「口令不对」） */
  authenticate(name: string, password: string): UserRow | null {
    const row = this.db
      .prepare('SELECT id, name, password_hash, is_admin, created_at FROM users WHERE name = ?')
      .get(name) as unknown as UserRecord | undefined;
    if (row === undefined) {
      // 用户不存在时也走一遍哈希：否则「有没有这个账号」能从响应时间上读出来
      verifyPassword(password, hashPassword('timer'));
      return null;
    }
    return verifyPassword(password, row.password_hash) ? toUser(row) : null;
  }

  // ---- 登录态 ----

  /**
   * 发一个登录态。返回**原文**令牌（只此一次），库里只留 sha256。
   *
   * 为什么库里不留原文：`adelie.db` 会被备份、被拷走；拿到库的人不该因此拿到
   * 所有人的登录态。哈希之后，攻击面是口令，不是令牌。
   */
  createAuthSession(userId: string, now = Date.now()): { token: string; expiresAt: number } {
    const token = newToken();
    const expiresAt = now + AUTH_SESSION_TTL_MS;
    this.db
      .prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash(token), userId, now, expiresAt);
    this.db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(now);
    return { token, expiresAt };
  }

  /** 令牌换用户。过期的顺手删掉，返回 undefined */
  resolveAuthSession(token: string, now = Date.now()): UserRow | undefined {
    const hash = tokenHash(token);
    const row = this.db
      .prepare('SELECT user_id, expires_at FROM auth_sessions WHERE token_hash = ?')
      .get(hash) as unknown as { user_id: string; expires_at: number } | undefined;
    if (row === undefined) return undefined;

    if (row.expires_at <= now) {
      this.db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hash);
      return undefined;
    }
    return this.findUser(row.user_id);
  }

  deleteAuthSession(token: string): void {
    this.db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash(token));
  }

  // ---- 会话归属索引 ----

  rememberSession(sessionId: string, userId: string, workspace: string, now = Date.now()): void {
    this.db
      .prepare('INSERT OR REPLACE INTO sessions (session_id, user_id, workspace, created_at) VALUES (?, ?, ?, ?)')
      .run(sessionId, userId, workspace, now);
  }

  forgetSession(sessionId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
  }

  sessionOwner(sessionId: string): SessionOwnerRow | undefined {
    const row = this.db
      .prepare('SELECT session_id, user_id, workspace, created_at FROM sessions WHERE session_id = ?')
      .get(sessionId) as unknown as
      | { session_id: string; user_id: string; workspace: string; created_at: number }
      | undefined;
    if (row === undefined) return undefined;
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      workspace: row.workspace,
      createdAt: row.created_at,
    };
  }

  /** 会话索引。`userId` 为 null 表示全部（管理员视角） */
  listSessionRows(userId: string | null): SessionOwnerRow[] {
    const rows = (userId === null
      ? this.db.prepare('SELECT session_id, user_id, workspace, created_at FROM sessions ORDER BY session_id').all()
      : this.db
          .prepare('SELECT session_id, user_id, workspace, created_at FROM sessions WHERE user_id = ? ORDER BY session_id')
          .all(userId)) as unknown as {
      session_id: string;
      user_id: string;
      workspace: string;
      created_at: number;
    }[];
    return rows.map((row) => ({
      sessionId: row.session_id,
      userId: row.user_id,
      workspace: row.workspace,
      createdAt: row.created_at,
    }));
  }

  /** 已知的会话 id 集合。重建索引时要拿它做差集 */
  knownSessionIds(): Set<string> {
    const rows = this.db.prepare('SELECT session_id FROM sessions').all() as unknown as { session_id: string }[];
    return new Set(rows.map((row) => row.session_id));
  }

  // ---- 每用户的运行配置 ----

  readUserSettings(userId: string): string | null {
    const row = this.db.prepare('SELECT json FROM user_settings WHERE user_id = ?').get(userId) as unknown as
      | { json: string }
      | undefined;
    return row === undefined ? null : row.json;
  }

  writeUserSettings(userId: string, json: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO user_settings (user_id, json) VALUES (?, ?)')
      .run(userId, json);
  }
}

/**
 * 令牌只以 sha256 落库。用哈希而不是明文，理由见 createAuthSession。
 *
 * 这里用 sha256 而不是 scrypt：令牌是 128 位随机数，没有「弱口令」可猜，
 * 穷举本身不可行，所以只需要一个不可逆的定长映射。
 */
function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
