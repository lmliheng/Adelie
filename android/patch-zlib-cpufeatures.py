#!/usr/bin/env python3
"""arm64 交叉编译 Node 时 zlib 找不到 cpu-features.h 的修复。

Node 的 common.gypi 里本来有一条 `-I<(android_ndk_path)/sources/android/cpufeatures`
（Termux 的补丁把它删了，因为 Termux 用系统 zlib），而 deps/zlib/cpu_features.c 在
`OS=="android" and arm_fpu=="neon"` 时 `#include <cpu-features.h>`。arm64 一定走这个分支，
于是编译失败。这里不再依赖 android_ndk_path 这个我们没传的变量：把 NDK 里的
cpu-features.h / cpu-features.c 拷进 deps/zlib/cpufeatures/（Apache-2.0），再让 zlib 目标
在 android/arm64 下编译它。

用法：python3 patch-zlib-cpufeatures.py <node 源码树>
"""
import os
import shutil
import sys

NDK = os.environ.get('ANDROID_NDK', '/opt/android-sdk/ndk/27.0.12077973')


def main() -> int:
    src = sys.argv[1] if len(sys.argv) > 1 else '/root/build/node/arm64/node-v24.22.3'
    ndk_dir = os.path.join(NDK, 'sources/android/cpufeatures')
    dst_dir = os.path.join(src, 'deps/zlib/cpufeatures')
    os.makedirs(dst_dir, exist_ok=True)
    for name in ('cpu-features.h', 'cpu-features.c'):
        shutil.copyfile(os.path.join(ndk_dir, name), os.path.join(dst_dir, name))

    gyp = os.path.join(src, 'deps/zlib/zlib.gyp')
    with open(gyp) as f:
        text = f.read()
    marker = 'cpu-features.c'
    if marker in text:
        print('zlib.gyp already patched')
        return 0
    anchor = """            ['OS=="mac" or OS=="ios" or OS=="freebsd" or OS=="android"', {
              # Mac, Android and the BSDs don't have fopen64, ftello64, or"""
    if anchor not in text:
        print('anchor not found in zlib.gyp', file=sys.stderr)
        return 1
    block = """            ['OS=="android" and target_arch=="arm64"', {
              # deps/zlib/cpu_features.c includes <cpu-features.h> on ARM Android;
              # the NDK ships it under sources/android/cpufeatures (copied here).
              'include_dirs': [ '<(ZLIB_ROOT)/cpufeatures' ],
              'sources': [ '<(ZLIB_ROOT)/cpufeatures/cpu-features.c' ],
            }],
"""
    with open(gyp, 'w') as f:
        f.write(text.replace(anchor, block + anchor, 1))
    print('patched', gyp)
    return 0


if __name__ == '__main__':
    sys.exit(main())
