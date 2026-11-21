#!/usr/bin/env bash
# 把打好的 APK 发布到 3003 那台设计站（静态下载目录 + 清单）。
#
#   bash publish-3003.sh build/adelie-android-arm64.apk
#
# 站点：/opt/adelie-design（server.mjs，PORT=3003），静态根下 downloads/ 里的文件带
# attachment 头、认 Range；首页读 /downloads/index.json 渲染下载列表。
set -eu

APK="${1:?usage: publish-3003.sh <apk>}"
SITE="${SITE_ROOT:-/opt/adelie-design}"
NAME="$(basename "$APK")"
DEST_DIR="$SITE/downloads/android"
BASE_URL="${BASE_URL:-http://127.0.0.1:3003}"

mkdir -p "$DEST_DIR"
cp "$APK" "$DEST_DIR/$NAME"

python3 - "$SITE/downloads/index.json" "$DEST_DIR/$NAME" "$NAME" <<'PY'
import hashlib, json, os, shutil, sys, time

index_path, apk_path, name = sys.argv[1:4]
with open(index_path, encoding='utf-8') as f:
    data = json.load(f)

size = os.path.getsize(apk_path)
h = hashlib.sha256()
with open(apk_path, 'rb') as f:
    for chunk in iter(lambda: f.read(1 << 20), b''):
        h.update(chunk)
digest = h.hexdigest()

entry = {
    'name': name,
    'label': '手机版 · Android arm64 · 1.0.1 内测版',
    'desc': '整包自带 bionic 版 Node 24 与 Adelie 本体，不需要 Termux、不需要 proot。'
            'Material 3 常规 App 外壳：启动页动画、底部四个 tab（对话 / 智能体 / 模型 / 设置）、'
            '应用图标；不占地方的顶部；运行日志与重载收在「设置 → 开发者」的开关后面。'
            '引擎全在手机上，不连任何服务器。未上架商店、未签名发布，安装时系统会提示“来自未知来源”。',
    'size': size,
    'sha256': digest,
    'url': f'/downloads/android/{name}',
}

versions = data.setdefault('versions', [])
block = next((v for v in versions if v.get('tag') == 'android-test'), None)
if block is None:
    block = {'tag': 'android-test', 'files': [], 'generated_at': ''}
    versions.append(block)
# 只留最新那份：旧包的 sha256 已经对不上文件内容了，留着只会让人下错
block['files'] = [entry]
block['generated_at'] = time.strftime('%Y-%m-%d %H:%M CST')

stamp = time.strftime('%Y%m%d-%H%M%S')
shutil.copyfile(index_path, index_path + '.bak-' + stamp)
with open(index_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write('\n')
print(f'index.json: {name} {size} bytes sha256 {digest}')
PY

echo "== 校验下载"
curl -sI "$BASE_URL/downloads/android/$NAME" | sed -n '1p;/content-length/Ip;/content-type/Ip'
curl -s "$BASE_URL/downloads/index.json" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("versions:", [v["tag"] for v in d["versions"]]); print("files:", [f["name"] for v in d["versions"] for f in v["files"]])'
echo "下载地址：$BASE_URL/downloads/android/$NAME"
