# 换布局不再丢掉消息绑定面板里没保存的改动

- **Date:** 2026-11-20
- **Type:** fix
- **Scope:** `web`

[English](2026-11-20-messaging-form-across-layout.md)

消息绑定面板（「远程控制」标签页）是一块停靠面板：窗口跨过断点（宽窗口的右侧栏 ↔ 窄屏的合并面）时，它从
一侧的挂载点挪到另一侧，原来那份被卸载、新起一份。新起的那份把绑定从服务端读回来，而读者刚粘进去的机器人
token、刚敲的 App ID、刚切过去的渠道都只在旧那份里 —— 跨一次断点就没了，得重新粘一遍。真浏览器里量过：
两格里都有字时，390 上读回来是 `""` / `""`，跨回 1280 仍是 `""` / `""`。

现在这块面板也把读者敲的字带过去，规则与文件、记忆、轨迹三块一样：**只有换布局才交回**。关掉标签页再开、
切到别的会话再回来，仍旧从服务端那一份开始。

## 细节

- `packages/web/src/features/messaging/messaging-form-keep.ts`（新）：按会话记一份表单 —— 离开时的停靠面与
  表单本身。只在落到**另一个**停靠面时才交回；记录进出各拷一份；另导出 `sameMessagingForm`（整份比较，不比
  `formDirty` —— 后者判的是**选中的那个渠道**，而读者可能在飞书填了 token 之后切到 QQ 再看）。
- `packages/web/src/features/messaging/messaging-binding-editor.tsx`：`useMessagingBinding` 多接一个可选的
  `surface`；初次加载时把服务端那一份当基线、把记录里的表单当显示值（于是那些编辑仍算「没保存」，仍要保存，
  与移动之前一样）；另有一个 effect 在每次变化时写记录 —— 表单与服务端一致时（没敲东西、或刚保存过）把记录
  删掉，不把「什么都没改」记成一处位置。
- `packages/web/src/features/messaging/messaging-panel.tsx`：面板把 `surface` 传给钩子。
- `packages/web/src/features/chat/builtin-dock-panels.tsx`：消息标签页的体从 `useDockPanel()` 取所在表面
  （`merged ? "merged" : position`），与另外几块同一写法。
- 弹窗那个宿主（`messaging-binding-modal.tsx`）不传 `surface`，既不读也不写这份记录：一个会话里没保存的字
  不会跑到为它打开的弹窗里。

## 测试

- `packages/web/test/messaging-form-keep.test.ts`（新，7 条）：只交给另一个面、不交给同一个面；没留过记录的
  会话没有；两个方向都能交回；删掉之后没有；进出各拷一份；整份比较（飞书填了、选中 QQ 也算改了）。
- `packages/web/e2e/messaging-form-across-layout.spec.mjs`（新，3 条）：① 两格里都敲上字，1280 → 390 → 1280
  两侧都读回原字；② 切到 QQ 并填 QQ 的 App ID，往返之后仍在 QQ、字也在；③ 关掉标签页再开 —— 面板从服务端
  那一份开始，随后那次跨界也没有东西可交（护栏）。
- **反证（同一份 spec，改前产物）**：2 failed —— ① 390 上读到 `{appId:"", secret:""}`；② 读到
  `{onQQ:"", qqPicked:"false"}`。第三条改前也绿（它就是那条护栏）。
- 两态探针（同一脚本，两条腿各敲一次字）：改后三刻都是 `cli_before_probe` + 密文；改前 390 与跨回 1280 都是
  空。

## 兼容性

只动前端状态：接口、线上格式与已存数据都没变。记录只在内存里，刷新后仍从服务端那一份开始（与改前一致）。
