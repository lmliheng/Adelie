App({
  globalData: {
    version: "1.0.0",
  },

  onLaunch() {
    // 记录一次启动时间，用于「关于」页展示
    try {
      wx.setStorageSync("app:lastLaunch", Date.now());
    } catch (e) {
      // 存储不可用时忽略
    }
  },
});
