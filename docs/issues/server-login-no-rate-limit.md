---
title: "server: 登录接口没有速率限制，口令可以一直猜"
labels: [欠账, scope:server, P2]
---

## 现象

`POST /api/auth/login` 对失败次数没有任何限制：不延迟、不锁定、不记数。口令
最短 6 位（`MIN_PASSWORD_LENGTH`），猜 6 位纯数字的空间也就 10^6 —— 一个
脚本在一分钟里能试完。

## 复现

```bash
for i in $(seq 1 50); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST localhost:7370/api/auth/login \
    -H 'content-type: application/json' -d "{\"name\":\"alice\",\"password\":\"guess$i\"}"
done
# → 50 个 401，没有一个请求被拖慢或拒绝；服务端日志里也没有痕迹
```

## 期望

至少挡住「跑脚本一直猜」这一档，不必做全套账号安全：

- 同一个用户名 / 来源地址连续失败 N 次后，把下一次尝试拖慢（scrypt 本身已是
  ~50ms，再叠一个指数退避就足够）；
- 失败尝试要有记录（哪来的、试了谁），挂在 `users/db.ts` 旁边即可，不必引入依赖；
- 注意别把这条路做成「锁死管理员」：内置 `admin` 初始没有口令，锁它等于锁掉整台机器的入口。

## 影响

- 服务端绑回环时影响有限（外面进不来）；但 PWA 那条路要求绑局域网
  （`ADELIE_HOST=0.0.0.0` + token），同一网段里的人在可以访问的端口上就能跑这个脚本。
- 没有绕过办法，只能靠口令强度 —— 而界面上的下限是 6 位。

## 证据

- `packages/server/src/routes/auth.ts` 的 `POST /api/auth/login`：失败直接
  `jsonError(c, 401, 'unauthorized', …)`，没有计数、没有延迟
- `packages/server/src/routes/auth.ts` 的 `MIN_PASSWORD_LENGTH = 6` 与注释
  「6 位挡不住暴力破解」—— 写注释的人知道，但没有第二道闸
- P3 真机验收里 50 次失败登录只体现为 50 条 401，没有任何节流
