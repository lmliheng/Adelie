// 面向 HTTP 的两个小工具：统一的错误体、宽松的 JSON 读入。
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * 统一的错误响应。
 *
 * 契约 §7 说所有错误都是 `{ error, message }`，而 §0 说 401 的响应体「固定」为
 * `{ error: "unauthorized" }`。两句冲突时按更具体的那条来：401 只回 error
 * （多带一个 message 就不再是「固定」），其余一律带上人读的 message。
 */
export function jsonError(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
): Response {
  if (status === 401) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  return c.json({ error: code, message }, status);
}

/**
 * 读一个 JSON 对象请求体。`null` 表示「不是对象或不是合法 JSON」。
 *
 * 空体按空对象处理：POST /api/sessions 的 body 可以省略（workspace 可选）。
 */
export async function readJsonObject(c: Context): Promise<Record<string, unknown> | null> {
  let text: string;
  try {
    text = await c.req.text();
  } catch {
    return null;
  }

  if (text.trim() === '') return {};

  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
