const app = getApp();

Page({
  data: {
    version: "1.0.0",
    lastLaunch: "",
  },

  onLoad() {
    let last = "";
    try {
      const ts = wx.getStorageSync("app:lastLaunch");
      if (ts) {
        const d = new Date(ts);
        const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
        last = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    } catch (e) {
      last = "";
    }
    this.setData({
      version: (app && app.globalData && app.globalData.version) || "1.0.0",
      lastLaunch: last,
    });
  },

  copyLink() {
    wx.setClipboardData({
      data: "https://github.com/",
      success: () => wx.showToast({ title: "已复制", icon: "none" }),
    });
  },
});
