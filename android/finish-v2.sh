#!/usr/bin/env bash
# 带 ICU 的 arm64 产物 → APK → 发布到 3003，一条命令做完（构建完成后用）。
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
NODE=/root/build/node/arm64/node-v24.22.3/out/Release/node
R=/opt/android-sdk/ndk/27.0.12077973/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf
VERSION=0.2.0

[ -x "$NODE" ] || { echo "missing $NODE" >&2; exit 1; }

echo "== node"
file "$NODE" | cut -c1-140
echo "ICU 数据符号：" && ($R -s "$NODE" | grep -c -E 'icudt[0-9]+_dat' || true)
echo "Intl 相关符号：" && ($R -s "$NODE" | grep -c -E 'u_strToUpper|UnicodeSet' || true)

echo "== APK"
cd "$HERE"
bash build-apk.sh arm64 > /tmp/build-apk-arm64.log 2>&1 || { tail -30 /tmp/build-apk-arm64.log; exit 1; }
tail -2 /tmp/build-apk-arm64.log
mv -f "build/adelie-android-arm64.apk" "build/adelie-android-arm64-$VERSION.apk"

echo "== 发布"
bash publish-3003.sh "build/adelie-android-arm64-$VERSION.apk"

echo "== 公网校验"
cd /tmp
curl -s -m 600 -o "/tmp/dl-$VERSION.apk" "http://110.42.63.153:3003/downloads/android/adelie-android-arm64-$VERSION.apk" \
  -w 'downloaded %{size_download} bytes http=%{http_code}\n'
sha256sum "/tmp/dl-$VERSION.apk"
curl -s http://110.42.63.153:3003/downloads/index.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
for v in d['versions']:
    for f in v['files']:
        if f['name'].endswith('.apk'):
            print('index:', f['name'], f['size'], f['sha256'])
"
