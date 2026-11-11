# 「推送整队机器」连开头都没做到时，错误中心记下是哪个项目、哪一步

- **日期:** 2026-11-11
- **类型:** 修复
- **范围:** `server`
- **破坏性变更:** 否

[English](2026-11-11-machines-fleet-sync-escape.md)

每一次写项目的模型配置 —— 整表 PUT、切默认模型、经平台 OAuth 流程铸出的 key —— 都收在
`machines.syncModelsEverywhere(projectId)` 上，发出去就不等：改 key 的人不该等一组 ssh 隧道。插件表的改动
也搭这一趟车。

这趟推送对**每台机器**本来就是尽力而为（一次同步自己的话进连接日志），但机器之前的那几次读不在那个 catch
里：`list()` 会问 ssh 配置里的每个别名「你现在握着哪条会话」，一条在那里抛错的传输，就让一个没有人持有的
promise 被拒。进程于是把它记成一条光秃秃的 `unhandled_rejection` —— 既没说这次推送是哪个项目的谁改出来的，
也没说是哪一步，而面板是按项目列筛选的。

现在推送接住了自己的逃逸并把它报上来：错误码是 `fleet_sync_failed`，项目作为这条记录的语境带上。
`MachinesEffects.recordError` 因此多了这两个字段 —— 它过去只带错误本身，这个文件里每一种「没有调用方」的失败
都是同一个分不开的类；「保持连接」定时器走同一个口子，传自己的 `machines_reconnect_failed`，也就是
`platform.ts` 的启动那一趟给同一类故障已经在用的错误码。**每台机器**自己的失败照旧不记：那些有连接日志，
而一台机器不肯收下凭证，并不是这趟推送没能开始。

## 细节

- `packages/server/src/machines/service.ts`：`syncModelsEverywhere` 把整个方法体包起来，包括原本在每台机器
  的 `try` 之外的列表与行读取，逃逸经 `#effects.recordError(err, "fleet_sync_failed", projectId)` 记下；
  `recordError` 的签名变成 `(err, code, projectId?) => void`；定时器那一处显式传 `"machines_reconnect_failed"`；
  模块的接线改走新增的纯函数 `machinesErrorRecord(err, code, projectId)` —— 它填 `source: "process"`，并且
  只在真有项目发问时才带上项目语境。

## 测试

- `packages/server/test/machines-fleet-sync.test.ts`（新增，5 条）：机器列表抛错时，按发问的那个项目记一条
  `fleet_sync_failed`，且调用方的 promise 仍然落地；同一个故障、promise 被丢弃（三个真实调用方都是这个形状）
  时没有任何东西逃出进程；某台已连接的机器自己同步失败不记；推送没够到任何已连接机器时一条都不记；以及记录
  形状只在有项目时才带项目。
- 反证：把这个方法退回改动前的写法，两条逃逸用例全红 —— 丢弃 promise 的那条是**从 `#liveSession` 经 `list()`
  冒出来的 unhandled rejection**。

## 兼容性

线上接口没变、没有新依赖、项目配置没变。推送成功时的行为、以及它对每台机器的尽力而为都照旧；真实服务上跑过
一次切默认模型与整表 PUT（一次性数据根），错误中心没有多出一条记录，进程日志没有 unhandled rejection。
