#!/usr/bin/env bash
#
# 把某个 GitHub Release 的附件拉到部署目录里，让 3004 自己成为下载站。
#
# 为什么要有这个脚本：发布产物挂在 GitHub Release 上，国内下载慢得没法用；
# 服务器本来就要开着 3004 给人看设计，顺手把安装包放在同一个域名下，
# 「下载」这件事就和「看设计」用同一条路径，不依赖 GitHub 的通畅程度。
#
# 它同时负责生成 downloads/index.json —— 页面上那个下载列表是读它渲染的，
# 所以加一次新版本只需要重跑一次这个脚本，不用改 HTML。
#
# 用法：
#   bash brand/site/fetch-release.sh            # 取最新的 release
#   bash brand/site/fetch-release.sh v0.1.0     # 取指定 tag
#   ADELIE_REPO=lmliheng/Adelie bash brand/site/fetch-release.sh v0.1.0
set -euo pipefail

REPO="${ADELIE_REPO:-lmliheng/Adelie}"
DST_ROOT="${ADELIE_DESIGN_DIR:-/opt/adelie-design}/downloads"
TAG="${1:-}"

if [ -z "$TAG" ]; then
  echo "没有给 tag，问一下 GitHub 最新的是哪个……"
  TAG="$(curl -fsSL --max-time 30 "https://api.github.com/repos/$REPO/releases/latest" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])')"
fi
echo "仓库 $REPO，版本 $TAG，落到 $DST_ROOT/$TAG"

mkdir -p "$DST_ROOT/$TAG"

# 附件清单交给 python3 解析：这台机器上没有 jq，而 python3 一定有。
curl -fsSL --max-time 60 -o "$DST_ROOT/$TAG/.release.json" "https://api.github.com/repos/$REPO/releases/tags/$TAG"
python3 - "$DST_ROOT/$TAG/.release.json" > "$DST_ROOT/$TAG/.assets.tsv" <<'PY'
import json, sys

release = json.load(open(sys.argv[1], encoding='utf-8'))
if not release.get('assets'):
    sys.exit('这个 release 没有附件')
published = release.get('published_at', '')
for asset in release['assets']:
    print('\t'.join([asset['name'], str(asset['size']), asset['browser_download_url'], published]))
PY

while IFS=$'\t' read -r name size url published; do
  out="$DST_ROOT/$TAG/$name"
  if [ -f "$out" ] && [ "$(stat -c%s "$out")" = "$size" ]; then
    echo "已存在，跳过：$name"
  else
    echo "下载 $name（$((size / 1048576)) MiB）"
    curl -fSL --retry 3 --retry-delay 2 --max-time 1800 -o "$out.part" "$url"
    mv "$out.part" "$out"
  fi
done < "$DST_ROOT/$TAG/.assets.tsv"

# 生成这一版的清单（含校验和）与总索引。
python3 - "$DST_ROOT" "$TAG" <<'PY'
import hashlib, json, os, sys, datetime

root, tag = sys.argv[1], sys.argv[2]

# 产物名字里认得出是什么，就给一句人话；认不出的照实说「发布附件」。
def label(name: str) -> tuple[str, str]:
    if name.startswith('Adelie-Setup') and name.endswith('.exe'):
        return '安装版 · Windows x64', '写注册表、带开始菜单，装完直接开'
    if name.startswith('Adelie-Portable') and name.endswith('.exe'):
        return '免安装版 · Windows x64', '单个 exe，双击就跑，不写系统'
    if name.startswith('adelie-web') and name.endswith('.zip'):
        return 'Web 静态包', '丢到任意静态服务器即可，含 PWA（含 manifest 与 service worker）'
    return '发布附件', ''

def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()

def build(vtag: str) -> dict:
    d = os.path.join(root, vtag)
    files = []
    for name in sorted(os.listdir(d)):
        p = os.path.join(d, name)
        # 清单自己不是产物：别把它也列进下载列表（上一次跑留下的 index.json 会在这一步被误收）
        if not os.path.isfile(p) or name.startswith('.') or name == 'index.json':
            continue
        lname, desc = label(name)
        files.append({
            'name': name,
            'label': lname,
            'desc': desc,
            'size': os.path.getsize(p),
            'sha256': sha256(p),
            'url': f'/downloads/{vtag}/{name}',
        })
    return {
        'tag': vtag,
        'files': files,
        'generated_at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
    }

versions = sorted(
    [v for v in os.listdir(root) if os.path.isdir(os.path.join(root, v))],
    key=lambda v: [int(x) if x.isdigit() else x for x in v.lstrip('v').replace('-', '.').split('.')],
    reverse=True,
)
for v in versions:
    idx = build(v)
    with open(os.path.join(root, v, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(idx, f, ensure_ascii=False, indent=2)

with open(os.path.join(root, 'index.json'), 'w', encoding='utf-8') as f:
    json.dump({'versions': [build(v) for v in versions]}, f, ensure_ascii=False, indent=2)

n = sum(len(build(v)['files']) for v in versions)
print(f'清单已生成：{len(versions)} 个版本、{n} 个文件 → {root}/index.json')
PY

rm -f "$DST_ROOT/$TAG/.assets.tsv" "$DST_ROOT/$TAG/.release.json"
echo "完成。页面上的下载列表读的是 $DST_ROOT/index.json"
