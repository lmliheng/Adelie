#!/usr/bin/env bash
#
# 把 brand/site 发布到 /opt/adelie-design 并重启常驻服务。
#
# 为什么是「拷贝」而不是让 systemd 直接指向仓库工作树：部署目录应该是稳定的，
# git checkout / 切分支 / 仓库挪位置都不该让线上那一页跟着变。代价就是要记得跑这个脚本。
#
# 用法：
#   bash brand/site/deploy.sh
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DST="${ADELIE_DESIGN_DIR:-/opt/adelie-design}"
UNIT="${ADELIE_DESIGN_UNIT:-adelie-design.service}"

if [ ! -f "$SRC/index.html" ]; then
  echo "找不到 $SRC/index.html" >&2
  exit 1
fi

mkdir -p "$DST"
# 用 cp 覆盖而不是 rsync --delete：这台机器上没有 rsync，而且单向删除在这里没有价值 ——
# 页面不再引用的图片留在部署目录里只是占点磁盘，误删却是不可逆的。
install -m 644 "$SRC/index.html" "$DST/index.html"
install -m 755 "$SRC/server.mjs" "$DST/server.mjs"
cp -r "$SRC/assets/." "$DST/assets/"

if systemctl list-unit-files --type=service 2>/dev/null | grep -q "^${UNIT%% *}"; then
  systemctl restart "$UNIT"
  sleep 1
  systemctl is-active "$UNIT"
else
  echo "（没有找到 $UNIT，跳过重启；直接起：node $DST/server.mjs）"
fi

PORT="${PORT:-3004}"
echo "已发布：http://127.0.0.1:$PORT/"
curl -sS -o /dev/null -w "健康检查 %{http_code}\n" "http://127.0.0.1:$PORT/healthz"
