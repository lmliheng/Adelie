/**
 * 页面逻辑的无头测试：把 wx / Page / getApp 打桩后直接跑 pages/index 的业务方法。
 * 微信开发者工具跑不了（服务器是 Linux 无图形界面），所以用这个保证核心逻辑正确。
 * 用法：node tools/test-page.js
 */
const assert = require("assert");

let store = {};
const toasts = [];
let modalConfirm = true;

global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ""),
  setStorageSync: (k, v) => {
    store[k] = v;
  },
  showToast: (o) => toasts.push(o && o.title),
  showModal: (o) => {
    if (o && o.success) o.success({ confirm: modalConfirm });
  },
  vibrateShort: () => {},
  navigateTo: () => {},
};
global.getApp = () => ({ globalData: { version: "test" } });

let pageDef = null;
global.Page = (def) => {
  pageDef = def;
};

require("../pages/index/index.js");
assert.ok(pageDef, "Page() 没有被调用");

function newInstance() {
  const inst = { data: JSON.parse(JSON.stringify(pageDef.data)) };
  inst.setData = function (patch, cb) {
    Object.assign(this.data, patch);
    if (cb) cb();
  };
  for (const key of Object.keys(pageDef)) {
    if (typeof pageDef[key] === "function") inst[key] = pageDef[key].bind(inst);
  }
  return inst;
}

const tap = (id) => ({ currentTarget: { dataset: { id } } });

// 1. 空存储时初始化
store = {};
let p = newInstance();
p.load();
assert.deepStrictEqual(p.data.counts, { total: 0, active: 0, done: 0 });
assert.strictEqual(p.data.visible.length, 0);

// 2. 空白输入不添加
p.setData({ input: "   " });
p.addTodo();
assert.strictEqual(p.data.todos.length, 0, "空白输入不应新增");
assert.ok(toasts.includes("先写点内容"), "应提示先写内容");

// 3. 正常添加：去空格、置顶、清空输入、落盘
p.setData({ input: "  写周报  " });
p.addTodo();
assert.strictEqual(p.data.todos.length, 1);
assert.strictEqual(p.data.todos[0].text, "写周报");
assert.strictEqual(p.data.input, "");
assert.strictEqual(store["todos:v1"].length, 1, "应写入本地存储");
assert.ok(p.data.todos[0].timeText, "应有时间文案");
assert.strictEqual(p.data.counts.active, 1);

// 4. 再添加一条，新的排在最前
p.setData({ input: "买牛奶" });
p.addTodo();
assert.strictEqual(p.data.todos[0].text, "买牛奶");
assert.strictEqual(p.data.counts.total, 2);

// 5. 切换完成状态
const firstId = p.data.todos[0].id;
p.toggleTodo(tap(firstId));
assert.strictEqual(p.data.todos[0].done, true);
assert.deepStrictEqual(p.data.counts, { total: 2, active: 1, done: 1 });

// 6. 筛选
p.setData({ filter: "done" });
p.commit(p.data.todos);
assert.strictEqual(p.data.visible.length, 1);
assert.strictEqual(p.data.visible[0].id, firstId);
p.setFilter({ currentTarget: { dataset: { filter: "active" } } });
assert.strictEqual(p.data.visible.length, 1);
assert.strictEqual(p.data.visible[0].text, "写周报");
p.setFilter({ currentTarget: { dataset: { filter: "all" } } });
assert.strictEqual(p.data.visible.length, 2);

// 7. 取消删除时数据不动
modalConfirm = false;
p.removeTodo(tap(firstId));
assert.strictEqual(p.data.todos.length, 2, "取消后不应删除");

// 8. 确认删除
modalConfirm = true;
p.removeTodo(tap(firstId));
assert.strictEqual(p.data.todos.length, 1);
assert.strictEqual(p.data.counts.done, 0);
assert.strictEqual(store["todos:v1"].length, 1, "删除后存储同步");

// 9. 持久化 round-trip：新实例能读回
const p2 = newInstance();
p2.load();
assert.strictEqual(p2.data.todos.length, 1);
assert.strictEqual(p2.data.todos[0].text, "写周报");

// 10. 清空已完成
p2.toggleTodo(tap(p2.data.todos[0].id));
p2.clearDone();
assert.strictEqual(p2.data.todos.length, 0);
assert.strictEqual(store["todos:v1"].length, 0);

// 11. 落盘时不应把展示用的 timeText 也存进去
p2.setData({ input: "检查存储字段" });
p2.addTodo();
assert.ok(!("timeText" in store["todos:v1"][0]), "存储里不应包含 timeText");

console.log("✅ 页面逻辑测试全部通过（11 项）");
