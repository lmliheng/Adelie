# 用户管理：每个账号的最近登录时间与累计开销

- **Date:** 2026-10-08
- **Type:** feature
- **Scope:** `server`, `web`

[English](2026-10-08-user-backend-last-login-and-cost.md)

用户管理表原先只写谁存在、什么角色、账号何时创建 —— 看不出这个账号有没有人在用、花掉了多少。
现在表上多了两列，都是服务端算出来给人看的只读值：

- **最近登录**（`UserInfo.lastLoginAt`，即 `users.last_login_at` 列）：由**校验密码的那一条路径**
  （`AuthService.login`）写入，所以管理员建好但没人登过的账号显示「从未登录」，而不是显示成今天。
  已存在的数据库由 `openDatabase` 的加列保护补上这一列，早于它写入的行读出来就是「从未登录」。
- **累计开销**（`UserInfo.totalCostUsd`）：该账号**名下**项目的全部历史用量，按当前价格折算 ——
  就是成本中心那张「累计」卡片，只不过按账号名下的项目汇总。价格是按项目配置的，所以汇总也是
  逐个项目的（`UsageQueries.lifetimeCost`，与 `modelTotals` 同一句不带筛选的分组查询）。
  其中如有模型没有价格，这个数就只是下限：接口用 `costUnpriced` 说明，表上以 `≥` 前缀显示；
  一点都算不出价格时整个字段省略，单元格画 `—`，而不是给一个读者分不清「免费」还是「没数据」的 0。

用户管理页是设置里唯一以宽表格为内容的页，因此它向 `PagedDialog` 要了更宽的版面
（`PagedDialog.widthClass`，默认仍是共用宽度）：六列加两个行内操作，否则会把「重置密码 / 删除」
挤出面板，只能横向滚动才够得着。

## 服务端

- `db/schema.ts` / `db/database.ts`：`users.last_login_at` 列与它的 `ensureColumn` 保护。
- `db/repos/users.ts` / `mechanisms/identity.ts`：`touchLastLogin`，以及 `UserRow` 上的这一列。
- `auth/service.ts`：密码登录成功时写入，并在本次登录返回的用户对象里带上它。
- `services/usage-service.ts` / `mechanisms/observability.ts`：`lifetimeCost(projectId)` —— 一次
  不带筛选的分组扫描，用与 `query` 相同的「按 provider/model 查价」折叠。
- `services/admin-service.ts`：`listUsers` 改为异步，逐个汇总账号名下项目的开销。
- `http/routes/admin.ts`：等这个列表。

## 网页端

- `features/admin/admin-users-page.tsx`：两列（金额跟随界面里的货币偏好）。
- `features/settings/settings-dialog.tsx`：用户管理页的面板宽度。
- `lib/strings.ts` / `lib/strings-en.ts`：列名、「从未登录」以及开销列的 tooltip。
- `packages/ui` 的 `overlays/paged-dialog`：可选的 `widthClass`。
