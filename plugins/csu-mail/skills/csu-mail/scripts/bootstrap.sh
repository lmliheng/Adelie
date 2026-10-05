#!/usr/bin/env bash
# csu-mail 引导：从「环境里没有 CSU_MAIL_ADDR / CSU_MAIL_AUTHCODE」到「两个变量都在密钥库里」。
#
# 这一步**必须登录一次网页邮箱**——专用密码只能在登录后的设置页生成，没有别的办法。
# 走的是 CAS SSO（Coremail 开着二次验证时唯一可靠的路）；登录一次之后就再也不碰统一身份认证了。
#
# 用法：
#   CSU_MAIL_ADDR=学号@csu.edu.cn \
#   CSU_CAS_USER=学号 CSU_CAS_PASS=密码 \
#   PROJECT_ID=<App Data Dir 的最后一段> \
#     bash scripts/bootstrap.sh
#
# 可选环境变量：
#   AGENT_ID         默认 default_agent
#   PASSWORD_NAME    专用密码名称，默认 agent-server
#   PYTHON           python 解释器，默认 python3（需要 requests / bs4 / pycryptodome）
#   PLAYWRIGHT_MODULE / CHROME_PATH   Playwright 与本机 Chromium 的路径
#   SECRET_OUT       额外把专用密码写到该文件（600，不删除）——给 systemd 这类读不了密钥库的场景用
#   NO_VAULT=1       不写密钥库，只打印该执行的两条命令
#   CSU_LOGIN_MODE   cas（默认）| direct（邮箱有自己的密码时才用；中南大学实测走不通）
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PYTHON:-python3}"
AGENT_ID="${AGENT_ID:-default_agent}"
PASSWORD_NAME="${PASSWORD_NAME:-agent-server}"
MODE="${CSU_LOGIN_MODE:-cas}"

# 密钥库里的键名以实际写进去的为准，这里两套都认、一律折成插件原本的名字。2026-10-05 用户写的是
# CSU_CAS_PASSWORD / CSU_CAS_ADDRESS；插件文档一直写的是 CSU_CAS_PASS / CSU_MAIL_ADDR。重命名要
# 重新抄一遍明文，不值得 —— 兼容读一遍即可。
CSU_MAIL_ADDR="${CSU_MAIL_ADDR:-${CSU_CAS_ADDRESS:-}}"
CSU_CAS_PASS="${CSU_CAS_PASS:-${CSU_CAS_PASSWORD:-}}"

die() { echo "✗ $*" >&2; exit 1; }

[ -n "${CSU_MAIL_ADDR:-}" ] || die "请设置 CSU_MAIL_ADDR（或 CSU_CAS_ADDRESS）：邮箱地址，如 学号@csu.edu.cn"
[ -n "${CSU_CAS_USER:-}" ] || die "请设置 CSU_CAS_USER（统一身份认证账号，通常是学号）"
[ -n "${CSU_CAS_PASS:-}" ] || die "请设置 CSU_CAS_PASS（或 CSU_CAS_PASSWORD）：统一身份认证密码"

[ -n "${CSU_MAIL_AUTHCODE:-}" ] && { echo "✓ 环境里已经有 CSU_MAIL_AUTHCODE（长度 ${#CSU_MAIL_AUTHCODE}），无需引导。"; echo "  直接自检即可：$PYTHON $HERE/mail.py check"; exit 0; }

# 先验依赖：python 侧 requests/bs4/pycryptodome，node 侧供 create_apppw.mjs 用
"$PYTHON" -c 'import requests, bs4, Crypto' 2>/dev/null \
  || die "$PYTHON 缺依赖，先装：$PYTHON -m pip install requests beautifulsoup4 pycryptodome"
command -v node >/dev/null || die "找不到 node（第②步生成专用密码要它）"

TMP="$(mktemp -d)"
cleanup() {
  [ -f "$TMP/secret" ] && { shred -u "$TMP/secret" 2>/dev/null || rm -f "$TMP/secret"; }
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "→ ① 登录网页邮箱换 sid（模式 $MODE，只这一次）"
CSU_MAIL_ADDR="$CSU_MAIL_ADDR" "$PYTHON" "$HERE/cas_login.py" --mode "$MODE" --out "$TMP/session.json" \
  || die "登录失败：不要重试，先找用户确认账号密码或账号状态（CAS 会被风控）。"

echo "→ ② 在网页邮箱里生成一条客户端专用密码（名称：$PASSWORD_NAME）"
PLAYWRIGHT_MODULE="${PLAYWRIGHT_MODULE:-playwright-core}" CHROME_PATH="${CHROME_PATH:-}" \
  node "$HERE/create_apppw.mjs" "$TMP/session.json" "$PASSWORD_NAME" --out "$TMP/secret" \
  || die "生成专用密码失败：确认已装 Playwright/Chromium（PLAYWRIGHT_MODULE、CHROME_PATH）。"

echo "→ ③ 写进密钥库（长度校验：$(wc -c < "$TMP/secret" | tr -d ' ') 字节）"
if [ "${NO_VAULT:-0}" = "1" ]; then
  echo "  NO_VAULT=1，跳过。请自己执行（注意必须指定项目，否则写进 default_project，环境里永远没有）："
  echo "    penguin config vault set --project-id <项目id> --agent-id $AGENT_ID --key CSU_MAIL_ADDR --value '$CSU_MAIL_ADDR'"
  echo "    penguin config vault set --project-id <项目id> --agent-id $AGENT_ID --key CSU_MAIL_AUTHCODE --value \"\$(cat 专用密码文件)\""
  [ -n "${SECRET_OUT:-}" ] && { install -m 600 "$TMP/secret" "$SECRET_OUT"; echo "  专用密码也写到了 $SECRET_OUT"; }
  exit 0
fi

[ -n "${PROJECT_ID:-}" ] || die "请设置 PROJECT_ID（= 运行环境 App Data Dir 的最后一段，如 /root/.penguin/data/sjaaj -> sjaaj）；
   否则凭据会落进 default_project：密钥库里查得到，Agent 的 shell 里却永远没有这个变量。"

command -v penguin >/dev/null || die "找不到 penguin CLI：请手动写密钥库，或用 NO_VAULT=1 看命令。"

penguin config vault set --project-id "$PROJECT_ID" --agent-id "$AGENT_ID" \
  --key CSU_MAIL_ADDR --value "$CSU_MAIL_ADDR"
penguin config vault set --project-id "$PROJECT_ID" --agent-id "$AGENT_ID" \
  --key CSU_MAIL_AUTHCODE --value "$(cat "$TMP/secret")"

[ -n "${SECRET_OUT:-}" ] && { install -m 600 "$TMP/secret" "$SECRET_OUT"; echo "✓ 专用密码副本写到 $SECRET_OUT（600）"; }

echo "✓ 完成。当前会话里还没有这两个变量（注入发生在会话开始），先这么用："
echo "    CSU_MAIL_ADDR=$CSU_MAIL_ADDR CSU_MAIL_AUTHCODE=<从密钥库读> python $HERE/mail.py check"
echo "  下一个新会话起，环境里会自动带上 CSU_MAIL_ADDR / CSU_MAIL_AUTHCODE。"
