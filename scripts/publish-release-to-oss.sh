#!/bin/sh
# Mirror the exact assets of an Adelie GitHub Release into Alibaba Cloud OSS.
#
# Usage: publish-release-to-oss.sh <release-dir> <tag> [update-latest]
#   <release-dir>  directory holding the Release assets, named exactly as they are on GitHub
#   <tag>          the Release tag, e.g. v0.3.1
#   update-latest  true only when <tag> is the Release GitHub currently calls latest (default false)
#
# Two locations come out of one run:
#
#   releases/<tag>/…   immutable — the tag names a fixed set of bytes, so these are uploaded
#                      once, never overwritten, and served with a year-long cache.
#   latest/…           stable — the same bytes under version-less names, rewritten on every
#                      release with `no-cache`, because a client that asks for
#                      `latest/adelie-desktop-win32-x64.exe` must never receive the previous
#                      release's copy.
#
# `latest/` is what a client points at: the desktop shell's generic feed
# (PENGUIN_UPDATE_FEED_URL=<public>/latest) reads latest.yml/latest-linux.yml there, the
# installer and `penguin update` take PENGUIN_DOWNLOAD_BASE_URL=<public>/latest and fetch the
# named asset beside the metadata, and a browser download of an installer needs no URL that
# changes per release.
#
# Adelie fork note (2026-10-06): upstream's version of this script mirrored upstream's asset
# names (its `penguin-desktop-*` installers, its darwin bundles, its SHA256SUMS files and its
# release-download-manifest probes) into releases/<tag>/ plus a latest.json pointer, for an OSS
# feed the app itself read. Adelie ships different assets and reads the mirror through the two
# environment variables named above, so the asset list and the `latest/` location are Adelie's.
# The environment contract, the immutability of releases/<tag>/ and the download-verified upload
# are upstream's, kept so the two scripts stay recognizably the same tool.
#
# Required environment:
#   OSS_BUCKET            bucket name, e.g. adelie-releases
#   OSS_REGION            region id, e.g. cn-hangzhou
#   OSS_ENDPOINT          endpoint host, e.g. oss-cn-hangzhou.aliyuncs.com
#   OSS_PUBLIC_BASE_URL   public base URL without a trailing slash, e.g.
#                         https://adelie-releases.oss-cn-hangzhou.aliyuncs.com
#   OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET  credentials with PutObject/GetObject on the bucket
#   OSSUTIL_BIN           optional path to the ossutil binary (default: ossutil on PATH)
set -eu

RELEASE_DIR="${1:?usage: publish-release-to-oss.sh <release-dir> <tag> [update-latest]}"
TAG="${2:?usage: publish-release-to-oss.sh <release-dir> <tag> [update-latest]}"
UPDATE_LATEST="${3:-false}"
OSSUTIL_BIN="${OSSUTIL_BIN:-ossutil}"

require_env() {
  eval "value=\${$1:-}"
  [ -n "$value" ] || {
    echo "error: required environment variable $1 is empty" >&2
    exit 1
  }
}

for name in OSS_BUCKET OSS_REGION OSS_ENDPOINT OSS_PUBLIC_BASE_URL \
  OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_SECRET; do
  require_env "$name"
done

[ -d "$RELEASE_DIR" ] || {
  echo "error: release directory not found: $RELEASE_DIR" >&2
  exit 1
}
case "$TAG" in
  v[0-9]*) VERSION="${TAG#v}" ;;
  *)
    echo "error: release tag must start with v followed by a digit: $TAG" >&2
    exit 1
    ;;
esac
case "$TAG" in
  *[!A-Za-z0-9._+-]*|*..*)
    echo "error: release tag is not safe for an OSS object prefix: $TAG" >&2
    exit 1
    ;;
esac
case "$UPDATE_LATEST" in
  true|false) ;;
  *)
    echo "error: update-latest must be true or false: $UPDATE_LATEST" >&2
    exit 1
    ;;
esac
command -v "$OSSUTIL_BIN" >/dev/null 2>&1 || {
  echo "error: ossutil not found: $OSSUTIL_BIN" >&2
  exit 1
}
command -v sha256sum >/dev/null 2>&1 || {
  echo "error: sha256sum is required" >&2
  exit 1
}

# The CLI bundles with their published checksums, the two installer scripts, and the desktop
# installers with the update metadata electron-updater reads (see
# packages/desktop/electron-builder.yml). macOS artifacts are not built yet, so no
# latest-mac.yml either — the day a signed dmg exists, it is another line in each group.
CLI_BUNDLES="
penguin-linux-x64.tar.gz
penguin-win32-x64.zip
penguin-universal.tar.gz
"
CLI_CHECKSUMS="
penguin-linux-x64.tar.gz.sha256
penguin-win32-x64.zip.sha256
penguin-universal.tar.gz.sha256
"
INSTALLER_SCRIPTS="
install.sh
install.ps1
"
DESKTOP_INSTALLERS="
adelie-desktop-win32-x64.exe
adelie-desktop-linux-x86_64.AppImage
adelie-desktop-linux-amd64.deb
"
DESKTOP_UPDATE_METADATA="
latest.yml
latest-linux.yml
"
DESKTOP_UPDATE_BLOCKMAPS="
adelie-desktop-win32-x64.exe.blockmap
"

FILES="$CLI_BUNDLES
$CLI_CHECKSUMS
$INSTALLER_SCRIPTS
$DESKTOP_INSTALLERS
$DESKTOP_UPDATE_METADATA
$DESKTOP_UPDATE_BLOCKMAPS
"

for file in $FILES; do
  [ -f "$RELEASE_DIR/$file" ] || {
    echo "error: missing GitHub Release asset: $file" >&2
    exit 1
  }
done

# Every bundle is checked against the checksum file that ships beside it, before anything is
# uploaded: a truncated download in the release directory must fail here, not on a user's machine.
for bundle in $CLI_BUNDLES; do
  (cd "$RELEASE_DIR" && sha256sum -c "$bundle.sha256")
done

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

oss_cp() {
  if [ -n "$3" ]; then
    "$OSSUTIL_BIN" cp "$1" "$2" \
      --endpoint "$OSS_ENDPOINT" \
      --region "$OSS_REGION" \
      --force \
      --no-progress \
      --cache-control "$3"
  else
    "$OSSUTIL_BIN" cp "$1" "$2" \
      --endpoint "$OSS_ENDPOINT" \
      --region "$OSS_REGION" \
      --force \
      --no-progress
  fi
}

# Server-side copy, with the destination's cache policy stated instead of inherited.
oss_copy_between() {
  "$OSSUTIL_BIN" cp "$1" "$2" \
    --endpoint "$OSS_ENDPOINT" \
    --region "$OSS_REGION" \
    --force \
    --no-progress \
    --metadata-directive REPLACE \
    --cache-control "$3"
}

file_sha256() {
  sha256sum "$1" | awk '{print $1}'
}

# Downloads the object back and compares it with the local file. The upload is what a user
# receives; only the round trip proves what is actually stored.
verify_remote_file() {
  local_file="$1"
  remote_uri="$2"
  remote_file="$WORK_DIR/remote-$(basename "$local_file")"
  rm -f "$remote_file"
  oss_cp "$remote_uri" "$remote_file" ""
  local_hash="$(file_sha256 "$local_file")"
  remote_hash="$(file_sha256 "$remote_file")"
  [ "$local_hash" = "$remote_hash" ] || {
    echo "error: OSS object differs from the release asset: $remote_uri" >&2
    exit 1
  }
}

# releases/<tag>/ is immutable: an existing object with identical bytes makes a retry
# idempotent, and one with different bytes is an error rather than an overwrite.
upload_immutable_file() {
  local_file="$1"
  object_key="$2"
  remote_uri="oss://$OSS_BUCKET/$object_key"
  existing_file="$WORK_DIR/existing-$(basename "$local_file")"
  rm -f "$existing_file"

  if oss_cp "$remote_uri" "$existing_file" "" >/dev/null 2>&1; then
    if [ "$(file_sha256 "$local_file")" = "$(file_sha256 "$existing_file")" ]; then
      echo "Already mirrored: $remote_uri"
      return
    fi
    echo "error: immutable OSS object already exists with different content: $remote_uri" >&2
    exit 1
  fi

  echo "Uploading: $remote_uri"
  oss_cp "$local_file" "$remote_uri" "public,max-age=31536000,immutable"
  verify_remote_file "$local_file" "$remote_uri"
}

RELEASE_PREFIX="releases/$TAG"
LATEST_PREFIX="latest"

for file in $FILES; do
  upload_immutable_file "$RELEASE_DIR/$file" "$RELEASE_PREFIX/$file"
done

if [ "$UPDATE_LATEST" = "true" ]; then
  # The stable names are copied from the immutable ones, never uploaded twice: one payload
  # transfer per release, and the bytes a client gets under latest/ are the tag's own.
  for file in $FILES; do
    echo "Publishing: oss://$OSS_BUCKET/$LATEST_PREFIX/$file"
    oss_copy_between "oss://$OSS_BUCKET/$RELEASE_PREFIX/$file" \
      "oss://$OSS_BUCKET/$LATEST_PREFIX/$file" "no-cache"
  done

  # Verified through the stable location, because that is the one clients read. The versioned
  # copies are the server-side source of exactly these bytes.
  for file in $FILES; do
    verify_remote_file "$RELEASE_DIR/$file" "oss://$OSS_BUCKET/$LATEST_PREFIX/$file"
  done

  PUBLIC_LATEST="${OSS_PUBLIC_BASE_URL%/}/$LATEST_PREFIX"
  PUBLIC_RELEASE="${OSS_PUBLIC_BASE_URL%/}/$RELEASE_PREFIX"

  # A pointer for anything that needs to learn the newest tag without the GitHub API — the
  # moment a script reads it, this is where the answer is.
  cat > "$WORK_DIR/latest.json" <<JSON
{
  "schemaVersion": 1,
  "tag": "$TAG",
  "version": "$VERSION",
  "releaseBaseUrl": "$PUBLIC_RELEASE",
  "latestBaseUrl": "$PUBLIC_LATEST"
}
JSON

  echo "Updating latest release pointer: oss://$OSS_BUCKET/latest.json"
  oss_cp "$WORK_DIR/latest.json" "oss://$OSS_BUCKET/latest.json" "no-cache"
  verify_remote_file "$WORK_DIR/latest.json" "oss://$OSS_BUCKET/latest.json"
else
  echo "Skipping latest/ and latest.json because update-latest is false."
fi

echo "OSS mirror verified for $TAG."
