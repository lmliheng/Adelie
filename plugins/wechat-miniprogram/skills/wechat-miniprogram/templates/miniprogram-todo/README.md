# 待办清单小程序（todo-miniprogram）

一个纯离线、零后端、零第三方依赖的微信小程序：记待办、勾选完成、删除、按「全部 / 未完成 / 已完成」筛选，数据存在本机 `wx.setStorageSync`。

- AppID：先在 `project.config.json` 里填自己的 AppID（本模板留作占位符 `wxTEMPLATE_PLACEHOLDER`）

## 目录

| 路径 | 作用 |
| --- | --- |
| `app.json` / `app.js` / `app.wxss` | 全局配置、启动逻辑、全局样式 |
| `pages/index/` | 首页：新增、勾选、删除、筛选、清空已完成 |
| `pages/about/` | 关于页 |
| `project.config.json` | 项目配置（AppID、编译设置、打包忽略） |
| `sitemap.json` | 搜索索引配置 |
| `upload.js` | 用 miniprogram-ci 上传代码，生成开发版 |
| `preview.js` | 用 miniprogram-ci 生成体验版二维码 |
| `tools/validate.js` | 本地静态校验（结构 / JSON / JS 语法 / WXML 插值） |
| `tools/test-page.js` | 无头逻辑测试（打桩 `wx` / `Page`，跑页面的增删改查） |

## 本地校验

```bash
npm install
npm run validate   # 结构与语法校验
node tools/test-page.js   # 页面逻辑单测
```

## 上传（Linux 命令行，无需微信开发者工具）

1. 在 mp.weixin.qq.com → 管理 → 开发管理 → 开发设置 → 小程序代码上传，生成上传密钥，下载 `private.<appid>.key`。
2. 运行：

```bash
MP_APPID=wx你的AppID MP_KEY_PATH=/path/to/private.<appid>.key MP_VERSION=1.0.0 node upload.js
```

上传成功后，到小程序后台「管理 → 版本管理」把该开发版设为体验版或提交审核。

体验版二维码：

```bash
MP_APPID=wx你的AppID MP_KEY_PATH=/path/to/private.<appid>.key node preview.js
```

> 密钥文件只放服务器或本机，不要提交进仓库、不要贴到聊天里。
