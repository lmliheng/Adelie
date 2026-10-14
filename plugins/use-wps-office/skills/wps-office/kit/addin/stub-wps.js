/**
 * 浏览器里假装 WPS —— 只给 Playwright 冒烟测试和本地调试用（契约 §4）。
 *
 * 面板在真 WPS 里拿 `window.wps` / `window.Application` 干活；在没有 WPS 的普通浏览器里，
 * panel.js 会动态 import 这个文件，于是同一份面板代码能跑通全部 op。假实现忠实执行契约 §3
 * 的语义（`expect` 不匹配必须报错、写操作改的是同一段、段落号 1 起），因为测试靠它判定
 * 面板是不是真的按契约改了「文档」。
 *
 * 模型：每篇文档是一串段落 `[{ text, style }]`，每一段在字符缓冲里占 `text + "\r"`，
 * 与 Word/WPS 的 Range 位置一致（第 1 段从 0 开始）。范围位置在文档被改动后不跟随，
 * 而 WPS 那边每次都会重新取，面板也是，够用。
 *
 * 顺带把 ribbon 用到的几个宿主接口也做出来（CreateTaskPane / GetTaskPane / PluginStorage /
 * Enum），这样在没有 WPS 的浏览器里点「Adelie」按钮的判断逻辑也能被测到。
 */

const PARAGRAPH_MARK = "\r";
const DEFAULT_STYLE = "正文";

const ENUM = {
  msoCTPDockPositionLeft: 0,
  msoCTPDockPositionRight: 2,
  wdLineBreak: 6,
  wdPageBreak: 7,
  wdSectionBreakNextPage: 2,
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sampleParagraphs() {
  return [
    { text: "季度报告草稿", style: "标题 1" },
    { text: "一、本季度概况", style: "标题 2" },
    { text: "本季度共交付三个版本，用户反馈集中在加载速度上。", style: "正文" },
    { text: "二、下一步计划", style: "标题 2" },
    { text: "十一月完成性能专项，十二月发布年度总结。", style: "正文" },
  ];
}

class FakeDoc {
  constructor({ name = "未命名.docx", path = "", paragraphs = [] } = {}) {
    this.name = name;
    this.path = path;
    this.paragraphs = paragraphs.length
      ? paragraphs.map((item) => ({
          text: String(item.text ?? ""),
          style: String(item.style ?? DEFAULT_STYLE),
        }))
      : [{ text: "", style: DEFAULT_STYLE }];
    this.selection = { start: 0, end: 0 };
  }

  /** 整篇文档的字符缓冲：每段是 `text + "\r"`。 */
  get buffer() {
    return this.paragraphs.map((item) => item.text + PARAGRAPH_MARK).join("");
  }

  /** 第 index 段（1 起）的起始字符位置。 */
  paraStart(index) {
    let start = 0;
    for (let i = 1; i < index; i += 1) start += this.paragraphs[i - 1].text.length + 1;
    return start;
  }

  /** 某个字符位置落在第几段（1 起）。 */
  paragraphIndexAt(position) {
    let start = 0;
    for (let i = 0; i < this.paragraphs.length; i += 1) {
      const end = start + this.paragraphs[i].text.length + 1;
      if (position < end) return i + 1;
      start = end;
    }
    return this.paragraphs.length;
  }

  clampSelection() {
    // 范围右端可以正好落在文档末尾（Range.End == 内容长度），所以按长度而不是长度 - 1 收边。
    const last = this.buffer.length;
    this.selection = {
      start: clamp(this.selection.start, 0, last),
      end: clamp(this.selection.end, 0, last),
    };
    if (this.selection.end < this.selection.start) this.selection.end = this.selection.start;
  }

  setSelection(start, end) {
    this.selection = {
      start: clamp(start, 0, this.buffer.length),
      end: clamp(end, 0, this.buffer.length),
    };
    this.clampSelection();
  }

  /** 把 [from, to) 换成 text —— `.Text` 写入与 `.Delete()` 都走这里。 */
  splice(from, to, text) {
    const buffer = this.buffer;
    const a = clamp(from, 0, buffer.length);
    const b = clamp(to, a, buffer.length);
    const oldParagraphs = this.paragraphs.map((item) => ({ ...item }));
    const oldStarts = oldParagraphs.map((_, index) => this.paraStart(index + 1));

    const next = buffer.slice(0, a) + text + buffer.slice(b);
    const tailStart = a + text.length; // 插入文本之后那些旧内容的新起点
    const shift = text.length - (b - a);

    const parts = next.split(PARAGRAPH_MARK);
    if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop(); // 末尾那个标记不额外算一段

    const rebuilt = [];
    let position = 0;
    for (const part of parts) {
      // 段落样式按「这一段在旧缓冲里来自哪一段」来定：改动之前的位置原样、之后的位置补位移、
      // 插入文本自身沿用插入点所在的段落。删掉段落标记时，后一段因此接管前一段的样式（与 Word 一致）。
      const oldPosition = position < a ? position : position >= tailStart ? position - shift : a;
      rebuilt.push({ text: part, style: styleAt(oldParagraphs, oldStarts, oldPosition) });
      position += part.length + 1;
    }
    this.paragraphs = rebuilt.length ? rebuilt : [{ text: "", style: oldParagraphs[0].style }];
    this.clampSelection();
  }

  /** range.InsertParagraphAfter()：在 position 处切开该段，后半段沿用样式。 */
  insertParagraphAfter(position) {
    const index = this.paragraphIndexAt(position);
    const paragraph = this.paragraphs[index - 1];
    const offset = clamp(position - this.paraStart(index), 0, paragraph.text.length);
    this.paragraphs.splice(
      index - 1,
      1,
      { text: paragraph.text.slice(0, offset), style: paragraph.style },
      { text: paragraph.text.slice(offset), style: paragraph.style },
    );
    this.clampSelection();
  }

  /** range.InsertBreak(type)：文本里留下的字符与 Word 一样 —— 分页 \f、分节 \n、换行 \v。 */
  insertBreak(position, type) {
    const character = type === 7 ? "\f" : [2, 3, 4, 5].includes(type) ? "\n" : "\v";
    this.splice(position, position, character);
  }
}

function styleAt(oldParagraphs, oldStarts, position) {
  let index = 0;
  for (let i = 0; i < oldStarts.length; i += 1) {
    if (oldStarts[i] <= position) index = i;
  }
  return oldParagraphs[Math.min(index, oldParagraphs.length - 1)].style;
}

class FakeRange {
  constructor(doc, start, end) {
    this.doc = doc;
    this.start = start;
    this.end = end;
  }

  get Start() {
    return this.start;
  }

  get End() {
    return this.end;
  }

  get Text() {
    return this.doc.buffer.slice(this.start, this.end);
  }

  set Text(value) {
    const text = String(value ?? "");
    this.doc.splice(this.start, this.end, text);
    this.end = this.start + text.length;
  }

  Delete() {
    this.doc.splice(this.start, this.end, "");
    this.end = this.start;
  }

  InsertParagraphAfter() {
    this.doc.insertParagraphAfter(this.end);
  }

  InsertBreak(type) {
    this.doc.insertBreak(this.end, type);
  }

  Select() {
    this.doc.setSelection(this.start, this.end);
  }
}

function paragraphObject(doc, index) {
  if (!Number.isInteger(index) || index < 1 || index > doc.paragraphs.length) {
    throw new Error(`段落 ${index} 不存在`);
  }
  return {
    get Range() {
      const start = doc.paraStart(index);
      return new FakeRange(doc, start, start + doc.paragraphs[index - 1].text.length + 1);
    },
    get Style() {
      const name = doc.paragraphs[index - 1].style;
      return { NameLocal: name, Name: name };
    },
    set Style(value) {
      const name = typeof value === "string" ? value : (value?.NameLocal ?? value?.Name);
      if (name) doc.paragraphs[index - 1].style = String(name);
    },
  };
}

function documentObject(doc) {
  return {
    get Name() {
      return doc.name;
    },
    get FullName() {
      return doc.path;
    },
    get DocID() {
      return doc.name;
    },
    Paragraphs: {
      get Count() {
        return doc.paragraphs.length;
      },
      Item: (index) => paragraphObject(doc, index),
    },
    Range: (start, end) => new FakeRange(doc, start, end),
    Activate() {},
  };
}

function selectionObject(doc) {
  return {
    get Start() {
      return doc.selection.start;
    },
    get End() {
      return doc.selection.end;
    },
    get Text() {
      return doc.buffer.slice(doc.selection.start, doc.selection.end);
    },
    get Range() {
      return new FakeRange(doc, doc.selection.start, doc.selection.end);
    },
  };
}

/** 装上假 WPS：返回内部状态与几个给测试用的小工具。 */
export function installStubWps(win = window) {
  const state = {
    documents: [
      new FakeDoc({
        name: "季度报告.docx",
        path: "C:\\Users\\Me\\Documents\\季度报告.docx",
        paragraphs: sampleParagraphs(),
      }),
    ],
    active: 0,
    pluginStorage: new Map(),
    taskPanes: new Map(),
    nextTaskPaneId: 1,
  };

  function activeDoc() {
    return state.documents[state.active] ?? null;
  }

  const app = {
    get ActiveDocument() {
      const doc = activeDoc();
      return doc ? documentObject(doc) : null;
    },
    Documents: {
      get Count() {
        return state.documents.length;
      },
      Item(index) {
        const doc = state.documents[Number(index) - 1];
        if (!doc) throw new Error(`文档 ${index} 不存在`);
        return documentObject(doc);
      },
      Add(name) {
        const doc = new FakeDoc({ name: name || `文档${state.documents.length + 1}.docx` });
        state.documents.push(doc);
        state.active = state.documents.length - 1;
        return documentObject(doc);
      },
    },
    get Selection() {
      const doc = activeDoc();
      return doc ? selectionObject(doc) : null;
    },
    get Enum() {
      return ENUM;
    },
    CreateTaskPane(url, title) {
      const id = `fake-pane-${state.nextTaskPaneId}`;
      state.nextTaskPaneId += 1;
      const pane = { ID: id, Url: url, Caption: title, Visible: false, Width: 0, DockPosition: -1 };
      state.taskPanes.set(id, pane);
      return pane;
    },
    GetTaskPane(id) {
      const pane = state.taskPanes.get(id);
      if (!pane) throw new Error(`任务窗格 ${id} 不存在`);
      return pane;
    },
    PluginStorage: {
      getItem: (key) => (state.pluginStorage.has(key) ? state.pluginStorage.get(key) : null),
      setItem: (key, value) => {
        state.pluginStorage.set(key, value);
      },
      removeItem: (key) => {
        state.pluginStorage.delete(key);
      },
    },
  };

  win.wps = { WpsApplication: () => app, Enum: ENUM };
  win.Application = app;

  const helpers = {
    app,
    state,
    activeDocument() {
      const doc = activeDoc();
      return {
        name: doc.name,
        path: doc.path,
        paragraphs: doc.paragraphs.map((item) => ({ ...item })),
        selection: { ...doc.selection },
      };
    },
    paragraphTexts() {
      return activeDoc().paragraphs.map((item) => item.text);
    },
    setParagraphs(paragraphs) {
      const doc = activeDoc();
      doc.paragraphs = paragraphs.map((item) => ({
        text: String(item.text ?? ""),
        style: String(item.style ?? DEFAULT_STYLE),
      }));
      doc.selection = { start: 0, end: 0 };
    },
    selectParagraphs(from, to = from) {
      const doc = activeDoc();
      const start = doc.paraStart(from);
      const end = doc.paraStart(to) + doc.paragraphs[to - 1].text.length;
      doc.setSelection(start, end);
    },
    selectText(start, end) {
      activeDoc().setSelection(start, end);
    },
  };

  win.__fakeWps = helpers;
  return helpers;
}

installStubWps();
