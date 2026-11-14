# 存储台账页说清它为什么量不到、读不到、扫不成 —— 而且只说一次

- **日期：** 2026-11-14
- **类型：** 修复
- **范围：** `web`

[English](2026-11-14-storage-page-failure.md)

**存储台账**页（`设置 → 存储台账`，仅管理员）有三处失败会丢掉原因：量不出数据根的那次遍历、
读不到清理模式（连带着账单与回收站也没读到）、以及服务端拒绝的那次扫描。三处都只画出一句不带
原因的话 ——「无法取得存储报告」「无法读取清理模式设置」「扫描失败」—— 而服务端自己的说法进了
一条六秒后自己消失的通知。这一页的第一句承诺是「没有人审阅就不移动任何东西」，它兑现不了的时候
必须在读者看着的地方交代，而且就在那个重试的控件旁边。

现在三处都把原因放进自己那句话里，画在各自控件的位置：遍历的那句在报告表头处（没有报告时就是
报告本该在的位置），模式的那句在开关下面那行，扫描的那句在它没能写出来的账单上方。

这一页的五处写入本来就已经各有自己的说明行（`storage-settings-refusal.ts`、`storage-trash-refusal.ts`）
—— 模式开关、固定、两个回收站动作、执行清理。可这五处**同时**又弹一条说同一句话的通知，于是同一次
被拒说了两遍，其中一遍还盖在页面顶部六秒。五条通知已去掉：控件旁边那行就是交代，而那个控件就是重试。

## 细节

- `packages/web/src/features/settings/storage-failure.ts`（新增）：`storageFailureText(failure, reason)`，
  三个取值 `report` / `state` / `scan`，句子放在词典里，每种失败守住自己的位置。
- `packages/web/src/features/settings/storage-section.tsx`：三个布尔改成句子本身（`failed` /
  `modeFailed` / `scanFailed` 都是 `string | null`），页面画出来的就是原因；五处已有说明行的 `catch`
  不再弹通知；所有失败改走 `refusalText` 而不是 `apiErrorText`（请求发出之前就失败的场合，显示出它
  自己那句话，而不是「未知错误」）。
- `packages/web/src/lib/strings.ts`、`strings-en.ts`：`storageFailed` / `storageModeFailed` /
  `storageScanFailed` 改成带 `reason` 的函数，在「永远成立的那半句」之后接上原因
  （「无法取得存储报告：…」）。模式那句仍然写明这一页按「已关闭」处理，因为它确实如此，模式下面的
  每个控件也正是因此不可用。

## 测试

- `packages/web/test/storage-failure.test.ts`：三种失败各说各的、原因原样传递、三句话互不相同、中英
  两种语言。
- `packages/web/e2e/storage-page-failure.spec.mjs`：真服务端 + 真浏览器，一种失败一条 —— 句子在页面上、
  通知区没有按钮、七秒后仍在、桩放行后同一个控件（重新测量 / 重新扫描）真的落地。拿上一版产物跑，
  三条都红在找不到那句话。

## 兼容性

没有接口变化、没有新依赖、没有配置变化。页面自己的措辞多出了服务端给的原因；这些失败原先会弹的
通知没有了。
