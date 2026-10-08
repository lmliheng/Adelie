# 机器的服务端比启动它的那条 ssh 会话活得久

- **Date:** 2026-10-08
- **Type:** fix
- **Scope:** `server`

[English](2026-10-08-machine-server-own-session.md)

本服务器经 ssh 启动某台机器的服务端时，现在让它跑在**自己的会话**里（宿主有 `setsid` 时就用它）。
此前它属于本侧这条 ssh 会话：连接一断（网络抖动、本侧那台机器休眠），sshd 会把该会话挂断，对端的
服务端随之而死，它当时在跑的每一个程序也一样。单靠 `nohup` 盖不住这件事：服务端自己起的子进程会重置
SIGHUP。本次从上游 PenguinHarness 移植（分支 `fix/machine-server-own-session`，提交 `7e1dca63`），
此前本 fork 没有这一条。

- `startServerCommand` 在 `command -v setsid` 找得到时（Linux 有，macOS 没有）给启动行加上 `setsid`；
  找不到时行为一字不变。
- 后台任务里 `setsid` 是原地 exec（该任务不是进程组长），所以命令打印出来的 pid 仍是服务端的 pid，
  就绪探测照常工作。
- 存放这次查找结果的变量用本 fork 的名字（`ADELIE_SETSID`）。
