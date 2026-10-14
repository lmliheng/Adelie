/**
 * Adelie WPS 加载项 —— 文档操作层（契约 §3 的每个 op 都在这里）
 *
 * 这一层只碰契约 §3「允许使用的 WPS API」白名单里的属性与方法；每个调用都包在
 * try/catch 里，属性缺失时抛出一句能读懂的错，绝不静默返回成功。段落号一律 1 起
 * （doc.Paragraphs.Item(i) 的 i）。所有写操作返回改完之后的**同一段落**信息。
 *
 * 出处：分段取 Range、Range.Delete() 之后再写入新文本、以及 InsertBreak 的位置取法
 * （取段落标记之前一格：max(Start, End - 1)），参考了 Apache-2.0 许可的文策 AI（WenCe）
 * WPS 加载项的 frontend/wps_word_plugin/src/components/js/docxJsonConverter.js
 * （editDocxParagraph / insertBreakAfterParagraph / deleteDocxPara）。代码为按本契约重写，
 * 未整段搬运。
 */

/** 一次读取最多返回的段落数（契约 §3 doc.read）。 */
const MAX_READ_PARAGRAPHS = 400;
/** selection.text 的截断长度（契约 §2.1）。 */
const SELECTION_TEXT_LIMIT = 4000;

/** 段落标记字符；para.Range.Text 的末尾就是它。 */
const PARAGRAPH_MARK = "\r";

/** 分隔符枚举（Word/WPS 通用值），app.Enum 里读不到时用它们兜底。 */
const BREAK_VALUES = { line: 6, page: 7, section: 2 };
const BREAK_ENUM_NAMES = {
  line: "wdLineBreak",
  page: "wdPageBreak",
  section: "wdSectionBreakNextPage",
};
const BREAK_LABELS = { line: "换行符", page: "分页符", section: "分节符" };

/** 本层自己的错误类型，调用方可以据此区分「契约里的业务错」与意外异常。 */
export class WpsApiError extends Error {
  constructor(message) {
    super(message);
    this.name = "WpsApiError";
  }
}

function fail(message) {
  throw new WpsApiError(message);
}

function reasonOf(error) {
  if (!error) return "未知错误";
  return error.message ? String(error.message) : String(error);
}

/** 去掉行尾空白（含段落标记、表格单元格标记）——`expect` 比较与对外返回的正文都用它。 */
export function normalizeParagraphText(text) {
  return String(text).replace(/[\s\u0007]+$/u, "");
}

function toInteger(value, name) {
  const num = Number(value);
  if (!Number.isInteger(num)) fail(`${name} 必须是整数，收到 ${JSON.stringify(value)}`);
  return num;
}

/* ------------------------------------------------------------------ *
 * 宿主与应用对象
 * ------------------------------------------------------------------ */

/** 契约 §3：`wps.WpsApplication()`，退化到 `window.Application`。 */
export function getApplication() {
  let app = null;
  try {
    if (window.wps && typeof window.wps.WpsApplication === "function")
      app = window.wps.WpsApplication();
  } catch (error) {
    console.warn(
      "[adelie] wps.WpsApplication() 调用失败，改用 window.Application：",
      reasonOf(error),
    );
  }
  if (!app) app = window.Application ?? null;
  if (!app) {
    fail("没有找到 WPS 应用对象：wps.WpsApplication() 与 window.Application 都不可用");
  }
  return app;
}

function activeDocument(app) {
  let doc = null;
  try {
    doc = app.ActiveDocument;
  } catch (error) {
    fail(`读取 app.ActiveDocument 失败：${reasonOf(error)}`);
  }
  if (!doc) fail("当前没有打开的文档，请先在 WPS 里打开或新建一篇文档");
  return doc;
}

function documentName(doc) {
  try {
    return doc.Name ? String(doc.Name) : "";
  } catch (error) {
    return "";
  }
}

function documentPath(doc) {
  try {
    return doc.FullName ? String(doc.FullName) : "";
  } catch (error) {
    return "";
  }
}

/* ------------------------------------------------------------------ *
 * 段落
 * ------------------------------------------------------------------ */

function paragraphCount(doc) {
  let raw;
  try {
    raw = doc.Paragraphs ? doc.Paragraphs.Count : undefined;
  } catch (error) {
    fail(`读取段落数失败：${reasonOf(error)}`);
  }
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 0) {
    fail(`WPS 没有给出有效的段落数（doc.Paragraphs.Count = ${JSON.stringify(raw)}）`);
  }
  return count;
}

function paragraphAt(doc, index) {
  const index2 = toInteger(index, "index");
  if (index2 < 1) fail(`段落号从 1 开始，收到 ${index2}`);
  const count = paragraphCount(doc);
  if (count === 0) fail("文档里一段都没有，先用 doc.create 新建一篇文档");
  if (index2 > count) fail(`段落 ${index2} 不存在（文档共 ${count} 段）`);
  let para = null;
  try {
    para = doc.Paragraphs.Item(index2);
  } catch (error) {
    fail(`取第 ${index2} 段失败：${reasonOf(error)}`);
  }
  if (!para) fail(`第 ${index2} 段不存在`);
  return para;
}

/** 取段落的字符范围；Start/End 是必读的两个数，缺了就没法改。 */
function paragraphRange(para, index) {
  let range = null;
  try {
    range = para.Range;
  } catch (error) {
    fail(`第 ${index} 段没有 Range：${reasonOf(error)}`);
  }
  if (!range) fail(`第 ${index} 段没有 Range`);
  const start = Number(range.Start);
  const end = Number(range.End);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    fail(`第 ${index} 段的 Range 不可用（Start=${range.Start}, End=${range.End}）`);
  }
  return { range, start, end };
}

/** 段落正文（原样，带段落标记）。 */
function paragraphRawText(para, index) {
  let text;
  try {
    text = para.Range ? para.Range.Text : undefined;
  } catch (error) {
    fail(`读取第 ${index} 段正文失败：${reasonOf(error)}`);
  }
  if (typeof text !== "string") fail(`第 ${index} 段读不到正文（para.Range.Text 不是字符串）`);
  return text;
}

function paragraphStyleName(para) {
  try {
    const style = para.Style;
    if (!style) return "";
    return String(style.NameLocal || style.Name || "");
  } catch (error) {
    // 样式只是附带信息，读不到不算失败。
    return "";
  }
}

/** 写操作返回的「同一段落」信息：段号 + 改完之后的正文。 */
function paragraphInfo(doc, index) {
  const para = paragraphAt(doc, index);
  return { index, text: normalizeParagraphText(paragraphRawText(para, index)) };
}

function docRange(doc, start, end) {
  let range = null;
  try {
    range = doc.Range(start, end);
  } catch (error) {
    fail(`取文档范围 [${start}, ${end}) 失败：${reasonOf(error)}`);
  }
  if (!range) fail(`取文档范围 [${start}, ${end}) 没有返回范围对象`);
  return range;
}

/** `expect` 校验：只比较「去掉行尾空白之后的当前正文」。 */
function assertExpect(args, currentText) {
  if (args.expect === undefined || args.expect === null) return;
  const expect = typeof args.expect === "string" ? args.expect : String(args.expect);
  if (currentText !== expect) fail("段落已变，先重新读取");
}

/** 读选区：from/to 是 1 起的段落号，没有选区（或宿主不给选区）时返回 null。 */
function selectionInfo(app, doc) {
  let start;
  let end;
  let text;
  try {
    const selection = app.Selection;
    if (!selection) return null;
    const range = selection.Range ?? selection;
    start = Number(range.Start);
    end = Number(range.End);
    text = typeof range.Text === "string" ? range.Text : "";
  } catch (error) {
    return null;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return {
    from: paragraphIndexAtChar(doc, start),
    to: paragraphIndexAtChar(doc, end - 1), // 右端是开区间，减 1 才是最后一个被选中的字符
    text: text.slice(0, SELECTION_TEXT_LIMIT),
  };
}

/** 某个字符偏移落在第几段（1 起）。段落的 Range 自带位置，按它比较最贴近真实文档。 */
function paragraphIndexAtChar(doc, offset) {
  const count = paragraphCount(doc);
  for (let i = 1; i <= count; i++) {
    const para = paragraphAt(doc, i);
    const { start, end } = paragraphRange(para, i);
    if (offset <= Math.max(start, end - 1)) return i;
  }
  return count;
}

/* ------------------------------------------------------------------ *
 * op 实现（契约 §3）
 * ------------------------------------------------------------------ */

async function opSummary() {
  const app = getApplication();
  const doc = activeDocument(app);
  return {
    name: documentName(doc),
    path: documentPath(doc),
    paragraphs: paragraphCount(doc),
    selection: selectionInfo(app, doc),
  };
}

async function opRead(args = {}) {
  const app = getApplication();
  const doc = activeDocument(app);
  const count = paragraphCount(doc);
  if (count === 0) return { paragraphs: [], truncated: false };

  const from = args.from === undefined || args.from === null ? 1 : toInteger(args.from, "from");
  const to = args.to === undefined || args.to === null ? count : toInteger(args.to, "to");
  if (from < 1) fail(`from 从 1 开始，收到 ${from}`);
  if (to < from) fail(`结束段号 ${to} 小于起始段号 ${from}`);

  const wantedEnd = Math.min(to, count);
  const limitedEnd = Math.min(wantedEnd, from + MAX_READ_PARAGRAPHS - 1);
  const paragraphs = [];
  for (let i = from; i <= limitedEnd; i++) {
    const para = paragraphAt(doc, i);
    paragraphs.push({
      index: i,
      text: normalizeParagraphText(paragraphRawText(para, i)),
      style: paragraphStyleName(para),
    });
  }
  return { paragraphs, truncated: wantedEnd > limitedEnd || to > count };
}

async function opSearch(args = {}) {
  const app = getApplication();
  const doc = activeDocument(app);
  const query = typeof args.query === "string" ? args.query : "";
  if (!query.trim()) fail("搜索词不能为空（query）");
  const limit =
    args.limit === undefined || args.limit === null ? 20 : toInteger(args.limit, "limit");
  if (limit < 1) fail(`limit 至少是 1，收到 ${limit}`);

  const needle = query.toLowerCase();
  const count = paragraphCount(doc);
  const matches = [];
  for (let i = 1; i <= count && matches.length < limit; i++) {
    const para = paragraphAt(doc, i);
    const text = normalizeParagraphText(paragraphRawText(para, i));
    if (!text) continue; // 跳过空段
    if (text.toLowerCase().includes(needle)) matches.push({ index: i, text });
  }
  return { matches };
}

async function opReplace(args = {}) {
  const app = getApplication();
  const doc = activeDocument(app);
  const index = toInteger(args.index, "index");
  if (typeof args.text !== "string") fail("text 必须是字符串");
  const text = args.text;
  if (/[\r\n\u000b\u000c]/u.test(text)) {
    fail("替换文本里不能有换行；要写多段请用 doc.insertAfter 一段一段插");
  }

  const para = paragraphAt(doc, index);
  const current = normalizeParagraphText(paragraphRawText(para, index));
  assertExpect(args, current);

  const { start, end } = paragraphRange(para, index);
  const contentEnd = Math.max(start, end - 1); // 留出末尾的段落标记，段落样式因此不变
  if (contentEnd > start) {
    const content = docRange(doc, start, contentEnd);
    if (typeof content.Delete !== "function")
      fail("这个 WPS 版本不支持 range.Delete()，无法替换段落正文");
    try {
      content.Delete();
    } catch (error) {
      fail(`清空第 ${index} 段正文失败：${reasonOf(error)}`);
    }
  }
  if (text) {
    const target = docRange(doc, start, start);
    try {
      target.Text = text;
    } catch (error) {
      fail(`写入第 ${index} 段正文失败：${reasonOf(error)}`);
    }
  }
  return paragraphInfo(doc, index);
}

async function opInsertAfter(args = {}) {
  const app = getApplication();
  const doc = activeDocument(app);
  const index = toInteger(args.index, "index");
  if (typeof args.text !== "string") fail("text 必须是字符串");
  const text = args.text;

  const para = paragraphAt(doc, index);
  const { start, end } = paragraphRange(para, index);
  const previousStyle = paragraphStyleName(para);
  const position = Math.max(start, end - 1);

  const mark = docRange(doc, position, position);
  if (typeof mark.InsertParagraphAfter !== "function") {
    fail("这个 WPS 版本不支持 range.InsertParagraphAfter()，无法在其后插入段落");
  }
  try {
    mark.InsertParagraphAfter();
  } catch (error) {
    fail(`在第 ${index} 段之后插入段落失败：${reasonOf(error)}`);
  }

  const newIndex = index + 1;
  const created = paragraphAt(doc, newIndex);
  if (previousStyle) {
    try {
      created.Style = previousStyle;
    } catch (error) {
      // 新段落本来就继承前一段的样式，这里只是显式再写一遍；写不进去不是失败。
      console.warn(`[adelie] 第 ${newIndex} 段设置样式 ${previousStyle} 失败：`, reasonOf(error));
    }
  }

  if (text) {
    const target = paragraphAt(doc, newIndex);
    const range = paragraphRange(target, newIndex);
    const writeAt = range.start;
    const contentEnd = Math.max(writeAt, range.end - 1);
    if (contentEnd > writeAt) {
      const content = docRange(doc, writeAt, contentEnd);
      if (typeof content.Delete === "function") content.Delete();
    }
    const writeRange = docRange(doc, writeAt, writeAt);
    try {
      writeRange.Text = text;
    } catch (error) {
      fail(`写入新段落正文失败：${reasonOf(error)}`);
    }
  }
  return paragraphInfo(doc, newIndex);
}

async function opDelete(args = {}) {
  const app = getApplication();
  const doc = activeDocument(app);
  const index = toInteger(args.index, "index");

  const count = paragraphCount(doc);
  const para = paragraphAt(doc, index);
  const current = normalizeParagraphText(paragraphRawText(para, index));
  assertExpect(args, current);
  if (count <= 1) {
    fail("这是文档里最后一段，删掉就没有段落可用了；请先执行 doc.create 新建一篇空白文档");
  }

  const { start, end } = paragraphRange(para, index);
  let from;
  let to;
  if (index < count) {
    // 连本段的段落标记一起删，下一段上提。
    from = start;
    to = end;
  } else {
    // 末段：删「前一段的段落标记 + 本段正文」，上一段因此成为最后一段。
    const previous = paragraphAt(doc, index - 1);
    const previousRange = paragraphRange(previous, index - 1);
    from = Math.max(0, previousRange.end - 1);
    to = Math.max(start, end - 1);
  }

  const target = docRange(doc, from, to);
  if (typeof target.Delete !== "function") fail("这个 WPS 版本不支持 range.Delete()，无法删除段落");
  try {
    target.Delete();
  } catch (error) {
    fail(`删除第 ${index} 段失败：${reasonOf(error)}`);
  }
  return { index };
}

async function opBreak(args = {}) {
  const app = getApplication();
  const doc = activeDocument(app);
  const index = toInteger(args.index, "index");
  const kind = args.kind;
  if (!Object.prototype.hasOwnProperty.call(BREAK_VALUES, kind)) {
    fail(`kind 只能是 line、page 或 section，收到 ${JSON.stringify(kind)}`);
  }

  const para = paragraphAt(doc, index);
  const { start, end } = paragraphRange(para, index);
  const position = Math.max(start, end - 1);
  const target = docRange(doc, position, position);
  if (typeof target.InsertBreak !== "function") {
    fail("这个 WPS 版本不支持 range.InsertBreak()，无法插入分隔符");
  }
  try {
    target.InsertBreak(breakValue(app, kind));
  } catch (error) {
    fail(`在第 ${index} 段之后插入${BREAK_LABELS[kind]}失败：${reasonOf(error)}`);
  }
  return { index };
}

/** 枚举值优先取宿主给的，取不到用 Word 通用值兜底（契约 §3 要求「写清楚并容错」）。 */
function breakValue(app, kind) {
  const name = BREAK_ENUM_NAMES[kind];
  try {
    const fromApp = app.Enum ? Number(app.Enum[name]) : NaN;
    if (Number.isFinite(fromApp)) return fromApp;
  } catch (error) {
    // 宿主没有 app.Enum 就一直往下走。
  }
  try {
    const fromWps = window.wps && window.wps.Enum ? Number(window.wps.Enum[name]) : NaN;
    if (Number.isFinite(fromWps)) return fromWps;
  } catch (error) {
    // 同上：读不到就用字面值。
  }
  return BREAK_VALUES[kind];
}

async function opCreate() {
  const app = getApplication();
  const documents = app.Documents;
  if (!documents || typeof documents.Add !== "function")
    fail("WPS 没有提供 app.Documents.Add，无法新建文档");

  let doc = null;
  try {
    // WdNewBlankDocument = 0；第 4 个参数为 true 表示窗口可见（契约 §3）。
    doc = documents.Add("", false, 0, true);
  } catch (error) {
    try {
      doc = documents.Add(); // 老版本不接受这四个参数
    } catch (error2) {
      fail(`新建文档失败：${reasonOf(error2)}`);
    }
  }
  if (!doc) fail("WPS 新建文档后没有返回文档对象");
  try {
    if (typeof doc.Activate === "function") doc.Activate();
  } catch (error) {
    // 新文档一般已经是活动文档，Activate 失败不影响结果。
  }
  const active = app.ActiveDocument ?? doc;
  return { name: documentName(active) };
}

async function opReveal(args = {}) {
  const app = getApplication();
  const doc = activeDocument(app);
  const index = toInteger(args.index, "index");
  const para = paragraphAt(doc, index);
  const { range } = paragraphRange(para, index);
  if (typeof range.Select !== "function")
    fail("这个 WPS 版本不支持 range.Select()，无法定位到该段");
  try {
    range.Select();
  } catch (error) {
    fail(`定位到第 ${index} 段失败：${reasonOf(error)}`);
  }
  return { index };
}

/* ------------------------------------------------------------------ *
 * 对外入口
 * ------------------------------------------------------------------ */

export const OPERATIONS = {
  "doc.summary": opSummary,
  "doc.read": opRead,
  "doc.search": opSearch,
  "doc.replace": opReplace,
  "doc.insertAfter": opInsertAfter,
  "doc.delete": opDelete,
  "doc.break": opBreak,
  "doc.create": opCreate,
  "doc.reveal": opReveal,
};

export const OPERATION_NAMES = Object.keys(OPERATIONS);

/**
 * 跑一个 op：认不出名字、参数不对、WPS 报错都抛 WpsApiError，绝不静默成功。
 * 桥那边把 message 原样带给调用者，所以这里的文案要让用户看得懂。
 */
export async function runOperation(op, args) {
  const handler = OPERATIONS[op];
  if (!handler) fail(`不认识的文档操作：${op}`);
  try {
    return await handler(args ?? {});
  } catch (error) {
    if (error instanceof WpsApiError) throw error;
    fail(`${op} 失败：${reasonOf(error)}`);
  }
}
