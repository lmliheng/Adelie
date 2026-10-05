const STORAGE_KEY = "todos:v1";

// 同一毫秒内可能连续添加多条，单用时间戳会撞 id，这里加随机后缀保证唯一
function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    todos: [],
    visible: [],
    input: "",
    filter: "all", // all | active | done
    counts: { total: 0, active: 0, done: 0 },
  },

  onLoad() {
    this.load();
  },

  // ---------- 数据 ----------
  load() {
    let todos = [];
    try {
      todos = wx.getStorageSync(STORAGE_KEY) || [];
    } catch (e) {
      todos = [];
    }
    if (!Array.isArray(todos)) todos = [];
    todos = todos.map((t) => ({ ...t, timeText: formatTime(t.createdAt || Date.now()) }));
    this.commit(todos);
  },

  persist(todos) {
    try {
      wx.setStorageSync(
        STORAGE_KEY,
        todos.map(({ timeText, ...rest }) => rest),
      );
    } catch (e) {
      wx.showToast({ title: "保存失败", icon: "none" });
    }
  },

  // 统一出口：落盘 + 计数 + 按筛选条件生成可见列表
  commit(todos) {
    const done = todos.filter((t) => t.done).length;
    const total = todos.length;
    const { filter } = this.data;
    const visible = todos.filter((t) => {
      if (filter === "active") return !t.done;
      if (filter === "done") return t.done;
      return true;
    });
    this.setData({
      todos,
      visible,
      counts: { total, done, active: total - done },
    });
    this.persist(todos);
  },

  // ---------- 交互 ----------
  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  addTodo() {
    const text = (this.data.input || "").trim();
    if (!text) {
      wx.showToast({ title: "先写点内容", icon: "none" });
      return;
    }
    const now = Date.now();
    const todos = [
      { id: makeId(), text, done: false, createdAt: now, timeText: formatTime(now) },
      ...this.data.todos,
    ];
    this.setData({ input: "" });
    this.commit(todos);
    wx.vibrateShort({ type: "light" });
  },

  toggleTodo(e) {
    const id = e.currentTarget.dataset.id;
    const todos = this.data.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    if (this.data.filter !== "all") {
      // 在筛选视图里切换状态时，让列表立刻反映当前筛选
      this.commit(todos);
      return;
    }
    this.commit(todos);
  },

  removeTodo(e) {
    const id = e.currentTarget.dataset.id;
    const target = this.data.todos.find((t) => t.id === id);
    wx.showModal({
      title: "删除这条待办？",
      content: target ? target.text.slice(0, 40) : "",
      confirmText: "删除",
      confirmColor: "#fa5151",
      success: (res) => {
        if (!res.confirm) return;
        this.commit(this.data.todos.filter((t) => t.id !== id));
      },
    });
  },

  clearDone() {
    const done = this.data.counts.done;
    if (!done) {
      wx.showToast({ title: "没有已完成的", icon: "none" });
      return;
    }
    wx.showModal({
      title: `清空 ${done} 条已完成？`,
      content: "清空后无法恢复",
      confirmText: "清空",
      confirmColor: "#fa5151",
      success: (res) => {
        if (!res.confirm) return;
        this.commit(this.data.todos.filter((t) => !t.done));
      },
    });
  },

  setFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    this.setData({ filter }, () => this.commit(this.data.todos));
  },

  goAbout() {
    wx.navigateTo({ url: "/pages/about/about" });
  },
});
