# 只搬走人批准过的东西的清理

- **Date:** 2026-10-10
- **Type:** feature
- **Scope:** `core`, `server`, `cli`, `web`, `docs`
- **Issue:** [#17](https://github.com/lmliheng/Adelie/issues/17)

[English](2026-10-10-storage-cleanup.md)

[存储台账](2026-10-10-storage-ledger.zh.md)已经能说清数据根里有什么，这一版是照着它动手的那一步，顺序就是设计里定死的：扫描 → 人过目 → 人批准。`scan` 写出一份**账单**；人在账单上勾选条目；`apply` 把勾中的条目搬进数据根自己的回收站，还能原地放回。没有任何东西挂在定时器上，没有任何阈值会自己动手，除非有人要求清理，否则没有任何东西会被 unlink。

## 细节

- **所有写操作都由「清理模式」把关，而它默认关闭。** 模式存在 `GET|PUT /api/admin/storage/settings`（`{enabled, trashTtlDays, pins}`）；`penguin storage mode on|off` 与设置页「存储」标签上的开关是唯一的两种改法。模式关闭时，扫描、pin、搬移、还原、清理回收站一律返回 `409 storage_mode_off`，而台账照旧可读——所以从没打开过它的安装，行为与上一版完全一致。同一时刻只有一个写操作，第二个返回 `409 storage_busy`。
- **账单是一个文件，被批准的正是它。** `POST /api/admin/storage/plans` 写出 `<root>/storage/plans/<planId>.json`，不动任何别的东西；id 以写入时的本地时间开头。每条记录带上类别、字节数、文件数、最后改动时间、命中的规则、由大小与修改时间算出的 `fingerprint`，以及这一版能不能搬它。账单自己的指纹覆盖全部条目，寿命 24 小时。
- **这一版只有临时工作区可执行。** `executableClasses` 由账单自己给出，所以以后才允许清理的类别已经先摆在账单上：会话草稿、轨迹、工具环境与数据库留在账单上标着**仅报告**，点名它们会被 `409 class_not_executable` 拒绝，而不是被悄悄跳过。数据库维护不在这一版里（见下）。
- **`apply` 需要账单 id、它的指纹，以及路径。** 没有「全部」，也不能点名类别——所以路由与 `penguin storage apply` 里都没有 `--yes`，一个什么都没选的运行在到达服务端之前就被拒。不在该账单上的路径（`400 unknown_path`）、被 pin 的路径（`409 pinned_path`）、已用过的账单（`409 plan_used`）、超过一天的账单（`409 plan_expired`）、指纹不符的账单（`409 plan_stale`），每一条都会中止运行并说明原因。
- **真正搬动之前的一瞬，整批重新核对磁盘。** 每个选中的条目都会重新解析到根目录内、重新测量：大小或修改时间变过的目录树返回 `409 plan_stale`，被 Session 重新用上的返回 `409 entry_still_live`，不再是根内真实目录的返回 `409 path_not_allowed`。这道核对是全有或全无，因此拒绝时会点名所有导致拒绝的路径，人的回应就是重新扫一次。
- **搬移是重命名进 `<root>/.trash/<时间戳>/items/<原路径>`，绝不是删除。** 回收站条目旁边有一份 `manifest.json`，而且每一次搬移都在发生**之前**写进 `<root>/logs/storage-gc.jsonl`。`penguin storage trash` 列出各批次，`trash restore <id>` 把条目重命名回原处、遇到挡路的东西就跳过（`target_exists`、`not_in_trash`）而不覆盖，`trash purge [<id>]` 是唯一的删除——带 id 删那一批，不带 id 只删超过 `trashTtlDays`（默认 14 天）的批次，而且只能触及 `.trash` 内部。
- **pin 让一个条目完全不进账单。** `POST /api/admin/storage/plans/:planId/pin`，或「存储」页上的 pin 开关。被 pin 的路径从此不出现在任何后续账单上，即便被人手动点名 `apply` 也会拒绝；模式的开关、每一次 pin 与 unpin 都写进同一份审计日志。
- **设置页补上了这套审核闭环。** 「存储」页保留原来的报告，并加上模式开关与回收站保留期、扫描按钮、账单条目（可执行的默认勾选、勾选权始终在人手上）、逐条 pin、搬移步骤，以及带还原与清理的回收站——整条链路不打开终端也能走完。
- **文档。** `/docs/cli § penguin storage` 与服务端 API 参考记录了这些子命令、每个路由、错误码与审核闭环，中英两份都已更新。

## 之后要做的

把清理回收站真正释放的空间在文件系统层面还回去（数据库自己的 `VACUUM`，以及今天仍为「仅报告」的那些类别）是另一笔改动：那更像一次维护窗口，而不是一次经审核的搬移；在数据库不是占满数据根的主因之前，它也还用不上。
