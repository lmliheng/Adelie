#!/usr/bin/env bash
# 把 Adelie 打成一个可侧载的 APK（B 路线：自带 bionic 版 Node，不用 Termux、不用 proot）。
#
#   bash build-apk.sh arm64      # 真机（绝大多数手机）
#   bash build-apk.sh x86_64     # 模拟器验证
#
# 现在是标准 Gradle + AndroidX + Material 3 工程（app/），脚本只做两件事：
# 把 node 与 Adelie 本体摆进 src/main/{jniLibs,assets}，然后调 Gradle 出包。
set -eu

ABI="${1:-arm64}"
SDK="${ANDROID_SDK:-/opt/android-sdk}"
NDK="${ANDROID_NDK:-$SDK/ndk/27.0.12077973}"
ADELIE_INSTALL="${ADELIE_INSTALL:-/root/.adelie}"
GRADLE="${GRADLE_BIN:-/opt/gradle-8.9/bin/gradle}"
HERE="$(cd "$(dirname "$0")" && pwd)"

case "$ABI" in
  arm64)  ARCHDIR=arm64-v8a; DEFAULT_NODE=/root/build/node/arm64/node-v24.22.3/out/Release/node
          TRIPLE=aarch64-linux-android ;;
  x86_64) ARCHDIR=x86_64;    DEFAULT_NODE=/root/build/node/node-v24.22.3/out/Release/node
          TRIPLE=x86_64-linux-android ;;
  *) echo "usage: $0 arm64|x86_64" >&2; exit 2 ;;
esac
# NODE_BIN 可以换成别的可执行文件（例如临时拿 Termux 里的 node 来验证 APK 外壳）
NODE="${NODE_BIN:-$DEFAULT_NODE}"
[ -x "$NODE" ] || { echo "missing node binary: $NODE" >&2; exit 1; }

ASSETS="$HERE/app/src/main/assets"
JNILIBS="$HERE/app/src/main/jniLibs"
OUT="$HERE/build/adelie-android-$ABI.apk"
mkdir -p "$HERE/build" "$ASSETS" "$JNILIBS/$ARCHDIR"

echo "== 1/4 payload（lib + web）"
python3 - "$ADELIE_INSTALL" "$ASSETS/payload.zip" <<'PY'
import os, sys, zipfile
root, out = sys.argv[1], sys.argv[2]
# 只带程序本体，不带任何数据目录（data/ 里有 Agent、会话和密钥）
parts = ['lib', 'web', 'bin']
skip_dirs = {'__pycache__', '.git'}
count = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for part in parts:
        base = os.path.join(root, part)
        if not os.path.exists(base):
            continue
        if os.path.isfile(base):
            z.write(base, part)
            count += 1
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in skip_dirs]
            rel = os.path.relpath(dirpath, root)
            if not filenames and not dirnames:
                z.writestr(rel + '/', b'')
            for name in filenames:
                p = os.path.join(dirpath, name)
                if os.path.islink(p) and not os.path.exists(p):
                    continue
                z.write(p, os.path.join(rel, name))
                count += 1
print(f'payload: {count} files, {os.path.getsize(out) / 1048576:.1f} MiB')
PY

echo "== 2/4 node（作为 libnode.so 放进 jniLibs，nativeLibraryDir 才允许执行）"
cp "$NODE" "$JNILIBS/$ARCHDIR/libnode.so"
chmod 755 "$JNILIBS/$ARCHDIR/libnode.so"
if "$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf" -d "$JNILIBS/$ARCHDIR/libnode.so" \
    | grep -q 'libc++_shared.so'; then
  cp "$NDK/toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/$TRIPLE/libc++_shared.so" \
     "$JNILIBS/$ARCHDIR/libc++_shared.so"
  echo "   带上 libc++_shared.so"
fi
"$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip" --strip-unneeded \
  "$JNILIBS/$ARCHDIR/libnode.so" 2>/dev/null || true

# 换 ABI 时别把上一个 ABI 的 .so 一起打进包
python3 - "$JNILIBS" "$ARCHDIR" <<'PY'
import os, shutil, sys
root, keep = sys.argv[1], sys.argv[2]
for name in os.listdir(root):
    p = os.path.join(root, name)
    if name != keep and os.path.isdir(p):
        shutil.rmtree(p)
        print('removed stale jniLibs/' + name)
PY

echo "== 3/4 gradle assembleDebug"
cd "$HERE"
# clean 是必须的：AGP 的增量打包会保留上一版 payload.zip 的位置，新包在尾部再写一份，
# APK 里就多出上百 MB 的死数据。
"$GRADLE" --no-daemon --console=plain :app:clean :app:assembleDebug

echo "== 4/4 收产物"
cp "$HERE/app/build/outputs/apk/debug/app-debug.apk" "$OUT"
"$SDK/build-tools/36.0.0/apksigner" verify --print-certs "$OUT" | head -3
ls -l "$OUT"
echo "built: $OUT"
