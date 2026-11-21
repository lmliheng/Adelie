#!/usr/bin/env bash
# 用 Android NDK 编译一个 bionic 版 Node，供 Adelie 的 APK 使用（B 路线，无 proot）。
#
#   bash build-node-android.sh x86_64     # 模拟器验证用
#   bash build-node-android.sh arm64      # 真机产物
#
# 产物：$NODE_SRC/out/Release/node
#
# 依赖：NDK r27（/opt/android-sdk/ndk/27.0.12077973）、gcc/g++、make、python3、patch。
set -eu

ARCH="${1:-x86_64}"
NODE_VERSION="${NODE_VERSION:-24.22.3}"
NDK="${ANDROID_NDK:-/opt/android-sdk/ndk/27.0.12077973}"
TC="$NDK/toolchains/llvm/prebuilt/linux-x86_64"
WORK="${WORK:-/root/build/node}"
SRC="$WORK/node-v$NODE_VERSION"
API=24                       # 与 Termux 一致的最低 API

case "$ARCH" in
  x86_64) TRIPLE=x86_64-linux-android; DEST_CPU=x64 ;;
  arm64)  TRIPLE=aarch64-linux-android; DEST_CPU=arm64 ;;
  *) echo "usage: $0 x86_64|arm64" >&2; exit 2 ;;
esac

[ -d "$SRC" ] || { echo "missing source at $SRC" >&2; exit 1; }
cd "$SRC"

# 1) Termux 的安卓补丁集（Node 24 上 18/19 直接可打；trap-handler 那个补丁针对 Node 26，
#    这里用等价改动：把 V8_TRAP_HANDLER_SUPPORTED 强制为 false）。
if [ ! -f .patches-applied ]; then
  for p in "$WORK"/patches/*.patch; do
    case "$p" in *trap-handler*) continue ;; esac
    patch -p1 --forward -i "$p" >/dev/null || echo "warn: $(basename "$p") did not apply"
  done
  python3 - <<'PY'
p = "deps/v8/src/trap-handler/trap-handler.h"
s = open(p).read()
if "V8_TRAP_HANDLER_SUPPORTED false\n\n#if V8_OS_ANDROID" not in s:
    start = s.index("// X64 on Linux, Windows, MacOS, FreeBSD.")
    end = s.index("#if V8_OS_ANDROID && V8_TRAP_HANDLER_SUPPORTED")
    open(p, "w").write(s[:start] + "#define V8_TRAP_HANDLER_SUPPORTED false\n\n" + s[end:])
PY
  touch .patches-applied
fi

# 2) gyp 在交叉编译时会用 CC 编译 host 工具；这里必须显式给 host 编译器，
#    否则 host 的 V8 会用 NDK clang 编，链接必炸。
export CC="$TC/bin/${TRIPLE}${API}-clang"
export CXX="$TC/bin/${TRIPLE}${API}-clang++"
export AR="$TC/bin/llvm-ar" RANLIB="$TC/bin/llvm-ranlib" STRIP="$TC/bin/llvm-strip"
export CC_host=gcc CXX_host=g++ LINK_host=g++ AR_host=ar

# 3) v8.gyp 引用的 host_os 在 Node 24 的 gyp 里没有定义（Node 26 才有），
#    交叉编译时在宿主上它就是 linux，这里直接把这几个条件改成等价形式。
if ! grep -q '"_toolset=="host"' tools/v8_gypfiles/v8.gyp 2>/dev/null; then
  sed -i 's/_toolset=="host" and host_os=="linux"/_toolset=="host"/g; s/_toolset=="host" and host_os=="mac"/_toolset=="host" and 0/g' \
    tools/v8_gypfiles/v8.gyp
fi

./configure \
  --prefix="/data/data/dev.adelie.app/files" \
  --dest-os=android --dest-cpu="$DEST_CPU" --cross-compiling \
  --with-intl=small-icu --openssl-no-asm \
  --without-npm --without-corepack

make -j"$(nproc)"

echo "built: $SRC/out/Release/node"
file "$SRC/out/Release/node"
