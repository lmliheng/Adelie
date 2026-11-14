#!/bin/bash
# 分段渲染：这台机器的 Chromium 在软渲染下大约每 3–5 分钟就崩一次（第 100 帧附近挂死，
# 渲染器进程直接消失），所以整片按 150 帧一段跑，每段一个全新的浏览器，最后无损拼接。
set -u
cd /root/.adelie/data/sjaaj/agents/default_agent/workspaces/tmp-588f9193/promo || exit 1
mkdir -p out/chunks
TOTAL=1800
STEP=150
for ((from = 0; from < TOTAL; from += STEP)); do
  to=$((from + STEP - 1))
  [ $to -ge $TOTAL ] && to=$((TOTAL - 1))
  f="out/chunks/c-${from}-${to}.mp4"
  if [ -s "$f" ]; then
    echo "skip $f"
    continue
  fi
  for attempt in 1 2 3; do
    echo "== chunk $from-$to attempt $attempt $(date +%H:%M:%S)"
    if timeout 900 npx remotion render Promo "$f" --frames="$from-$to" --crf=20 --concurrency=2 >>/tmp/render-chunks.log 2>&1; then
      echo "ok $f $(date +%H:%M:%S)"
      break
    fi
    rm -f "$f"
    echo "retry $f"
  done
done
echo "== all chunks done $(date +%H:%M:%S)"
