---
title: "desktop,web: Windows 安装包、Electron 窗口与 PWA 都没在真机上装过"
labels: [未验证, scope:desktop, P2]
---

## 结论是什么

v0.1.0 的四件产物里，这三件只有「构建成功」这一条证据：

- `Adelie-Setup-0.1.0-x64.exe` / `Adelie-Portable-0.1.0-x64.exe`：在 GitHub 的
  windows-latest runner 上打出来的，**没有任何 Windows 机器装过**；
- Electron 壳（挑端口、内置服务端、单实例、优雅退出）：没在本机跑起来过 ——
  服务器无 GPU 与桌面环境；
- PWA https://lmliheng.github.io/Adelie/ ：没在真机上「添加到主屏」过（登录态、
  安全区、离线外壳都是纸面设计）。

## 为什么没验证

没有 Windows 机器、这台服务器没有图形界面、也没法替用户操作他的手机。

## 怎么才能验证

1. Windows 安装包：用户在自己的 Windows 上装一次 —— 桌面壳的「无感登录」正是 P3 要改的
   那条路，P3 落地后需要再验一遍；
2. PWA：用户在手机上「添加到主屏」，打开一次，看是否要求重新填服务端地址与 token；
3. 这两件都要用户配合，因此它们的验收不能写成「我们跑过了」。

## 在此之前的影响

发布说明里对这三件产物只能说「构建成功」，不能说「可用」。这条 issue 存在的意义就是
让这句话有出处 —— 半年后有人问「Windows 上到底跑没跑过」，答案在这里。

## 证据

- Release `v0.1.0` 的产物清单与流水线 run `37194292152`（五个 job 全绿）
- `docs/release.md` 里各产物的产出方式
