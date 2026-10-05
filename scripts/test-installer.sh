#!/bin/sh
# Hermetic installer tests with tiny fixtures: canonical bundle layout, offline install with no
# network, POSIX upgrade rollback, and the online download flow through a stubbed curl
# (checksum layers, no-fallback failures, pre-0.1.6 legacy archives from pinned versions).
set -eu

ROOT_DIR="$(CDPATH= cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="$(mktemp -d)"
ARTIFACT_DIR="$WORK_DIR/artifacts"
PAYLOAD_DIR="$WORK_DIR/payloads"
STUB_BIN="$WORK_DIR/bin"
TEST_HOME="$WORK_DIR/home"
trap 'rm -rf "$WORK_DIR"' EXIT HUP INT TERM

fail_test() {
  echo "test failure: $1" >&2
  exit 1
}

# --- The launchers the release packages ship verbatim (scripts/launchers/). They are the only
#     spelling of the payload layout, so moving where web/ or node/ sits fails here rather than
#     shipping a package whose `penguin` cannot find its own web assets. ---
LAUNCHER_SH="$ROOT_DIR/scripts/launchers/penguin"
LAUNCHER_CMD="$ROOT_DIR/scripts/launchers/penguin.cmd"
[ -x "$LAUNCHER_SH" ] || fail_test "scripts/launchers/penguin is missing or not executable"
for marker in 'PENGUIN_WEB_DIST:-$DIR/web' '$DIR/node/bin/node' '$DIR/lib/dist/penguin.js'; do
  grep -qF "$marker" "$LAUNCHER_SH" || fail_test "the POSIX launcher does not carry $marker"
done
sh -n "$LAUNCHER_SH" || fail_test "the POSIX launcher is not valid sh"
for marker in '%DIR%\web' '%DIR%\node\node.exe' '%DIR%\lib\dist\penguin.js'; do
  grep -qF "$marker" "$LAUNCHER_CMD" || fail_test "the Windows launcher does not carry $marker"
done
# .gitattributes keeps this one CRLF, the only form cmd.exe is fully reliable with.
grep -q "$(printf '\r')" "$LAUNCHER_CMD" || fail_test "the Windows launcher is not CRLF"
# No penguin.ps1: PowerShell would prefer it on PATH, and Restricted policy would then break
# the plain `penguin` command.
[ ! -e "$ROOT_DIR/scripts/launchers/penguin.ps1" ] \
  || fail_test "a penguin.ps1 launcher must not be shipped"

write_sha256() {
  file="$1"
  (cd "$(dirname "$file")" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256")
}

make_posix_payload() {
  target="$1"
  output="$2"
  behavior="${3:-success}"
  payload="$WORK_DIR/payload-src"
  rm -rf "$payload"
  mkdir -p "$payload/penguin/bin" "$payload/penguin/lib" "$payload/penguin/web"
  if [ "$behavior" = "final-failure" ]; then
    {
      printf '%s\n' '#!/bin/sh'
      printf '%s\n' 'case "$0" in'
      printf '%s\n' '  */.staging.*/bin/penguin) echo fixture-new; exit 0 ;;'
      printf '%s\n' '  *) echo "fixture final-path failure" >&2; exit 42 ;;'
      printf '%s\n' 'esac'
    } > "$payload/penguin/bin/penguin"
  else
    {
      printf '%s\n' '#!/bin/sh'
      printf 'echo %s\n' "${4:-fixture-old}"
    } > "$payload/penguin/bin/penguin"
  fi
  chmod +x "$payload/penguin/bin/penguin"
  printf '%s\n' fixture > "$payload/penguin/lib/fixture.txt"
  mkdir -p "$payload/penguin/lib/vendor"
  printf '%s\n' vendored > "$payload/penguin/lib/vendor/data.txt"
  printf '%s\n' fixture > "$payload/penguin/web/index.html"
  printf '{"schemaVersion":1,"target":"%s"}\n' "$target" > "$payload/penguin/package-manifest.json"
  tar -czf "$output" -C "$payload" penguin
}

command -v sha256sum >/dev/null 2>&1 || fail_test "sha256sum is required"
command -v unzip >/dev/null 2>&1 || fail_test "unzip is required"
mkdir -p "$ARTIFACT_DIR" "$PAYLOAD_DIR" "$STUB_BIN" "$TEST_HOME"

case "$(uname -s):$(uname -m)" in
  Linux:x86_64) HOST_TARGET="linux-x64" ;;
  Linux:aarch64) HOST_TARGET="linux-arm64" ;;
  Darwin:x86_64) HOST_TARGET="darwin-x64" ;;
  Darwin:arm64) HOST_TARGET="darwin-arm64" ;;
  *) fail_test "unsupported fixture platform" ;;
esac
HOST_ASSET="penguin-$HOST_TARGET.tar.gz"

# --- Build fixture payloads and package them exactly like the release workflow. ---
for target in linux-x64 linux-arm64 darwin-x64 darwin-arm64 universal; do
  make_posix_payload "$target" "$PAYLOAD_DIR/$target.tar.gz"
done
windows_payload="$WORK_DIR/windows/penguin"
mkdir -p "$windows_payload/bin"
printf '%s\r\n' '@echo off' 'echo fixture-old' > "$windows_payload/bin/penguin.cmd"
printf '%s\n' '{"schemaVersion":1,"target":"win32-x64"}' > "$windows_payload/package-manifest.json"
(cd "$WORK_DIR/windows" && zip -qr "$PAYLOAD_DIR/win32-x64.zip" penguin)

sh "$ROOT_DIR/scripts/package-release-bundles.sh" "$PAYLOAD_DIR" "$ARTIFACT_DIR"

# Exercise the exact release-workflow stamping block against new, legacy, and inconsistent tag
# sources. The workflow must keep this logic inline because it checks out the requested tag, which
# may predate any helper script added to the repository.
STAMP_SCRIPT="$WORK_DIR/stamp-release-version.sh"
awk '
  /- name: Stamp release version/ && !found { found = 1; next }
  found && /run: \|/ { in_run = 1; next }
  in_run && /^      - name:/ { exit }
  in_run { sub(/^          /, ""); print }
' "$ROOT_DIR/.github/workflows/release.yml" > "$STAMP_SCRIPT"
sed -i 's/^TAG=.*/TAG="${TEST_RELEASE_TAG:?}"/' "$STAMP_SCRIPT"
grep -q 'SH_HAS_MARKER' "$STAMP_SCRIPT" \
  || fail_test "release workflow stamping block could not be extracted"

# Mirrors the three stamped constants of packages/core/src/index.ts. `make_stamp_case legacy`
# drops BUILD_COMMIT, standing in for a tag cut before that constant existed.
make_stamp_case() {
  case_dir="$1"
  mkdir -p "$case_dir/packages/core/src"
  printf '%s\n' \
    'export const VERSION = "0.0.0";' \
    'export const BUILD_DATE: string | null = null;' \
    > "$case_dir/packages/core/src/index.ts"
  [ "${2:-}" = legacy ] || printf '%s\n' 'export const BUILD_COMMIT: string | null = null;' \
    >> "$case_dir/packages/core/src/index.ts"
}

# GITHUB_SHA is exported to every step of a real Actions run, so each case below pins it
# rather than inheriting whatever the host happens to have set.
STAMP_SHA=0123456789abcdef0123456789abcdef01234567

STAMP_NEW_DIR="$WORK_DIR/stamp-new"
make_stamp_case "$STAMP_NEW_DIR"
printf '%s\n' 'EMBEDDED_RELEASE_VERSION="__PENGUIN_RELEASE_VERSION__"' \
  > "$STAMP_NEW_DIR/install.sh"
printf '%s\n' '$EmbeddedReleaseVersion = "__PENGUIN_RELEASE_VERSION__"' \
  > "$STAMP_NEW_DIR/install.ps1"
(cd "$STAMP_NEW_DIR" && TEST_RELEASE_TAG=v9.8.7 GITHUB_SHA="$STAMP_SHA" sh -e "$STAMP_SCRIPT")
grep -Fq 'EMBEDDED_RELEASE_VERSION="v9.8.7"' "$STAMP_NEW_DIR/install.sh" \
  || fail_test "release workflow did not stamp the POSIX installer"
grep -Fq '$EmbeddedReleaseVersion = "v9.8.7"' "$STAMP_NEW_DIR/install.ps1" \
  || fail_test "release workflow did not stamp the PowerShell installer"
grep -Fq 'export const VERSION = "9.8.7";' "$STAMP_NEW_DIR/packages/core/src/index.ts" \
  || fail_test "release workflow did not stamp core's VERSION"
grep -Eq 'export const BUILD_DATE: string \| null = "[0-9]{4}-[0-9]{2}-[0-9]{2}";' \
  "$STAMP_NEW_DIR/packages/core/src/index.ts" \
  || fail_test "release workflow did not stamp core's BUILD_DATE"
grep -Fq "export const BUILD_COMMIT: string | null = \"$STAMP_SHA\";" \
  "$STAMP_NEW_DIR/packages/core/src/index.ts" \
  || fail_test "release workflow did not stamp core's BUILD_COMMIT"

# Without GITHUB_SHA (a replay outside Actions) the commit stays null and the rest still stamps.
STAMP_NOSHA_DIR="$WORK_DIR/stamp-no-sha"
make_stamp_case "$STAMP_NOSHA_DIR"
printf '%s\n' 'EMBEDDED_RELEASE_VERSION="__PENGUIN_RELEASE_VERSION__"' \
  > "$STAMP_NOSHA_DIR/install.sh"
printf '%s\n' '$EmbeddedReleaseVersion = "__PENGUIN_RELEASE_VERSION__"' \
  > "$STAMP_NOSHA_DIR/install.ps1"
(cd "$STAMP_NOSHA_DIR" && TEST_RELEASE_TAG=v9.8.7 GITHUB_SHA= sh -e "$STAMP_SCRIPT") \
  > "$WORK_DIR/stamp-no-sha.output"
grep -Fq 'GITHUB_SHA is unset' "$WORK_DIR/stamp-no-sha.output" \
  || fail_test "release workflow did not report the unstamped commit"
grep -Fq 'export const BUILD_COMMIT: string | null = null;' \
  "$STAMP_NOSHA_DIR/packages/core/src/index.ts" \
  || fail_test "release workflow stamped a commit without GITHUB_SHA"
grep -Fq 'export const VERSION = "9.8.7";' "$STAMP_NOSHA_DIR/packages/core/src/index.ts" \
  || fail_test "release workflow skipped the version stamp when GITHUB_SHA was unset"

# A tag predating the BUILD_COMMIT constant must still rebuild.
STAMP_NOCONST_DIR="$WORK_DIR/stamp-no-commit-const"
make_stamp_case "$STAMP_NOCONST_DIR" legacy
printf '%s\n' 'EMBEDDED_RELEASE_VERSION="__PENGUIN_RELEASE_VERSION__"' \
  > "$STAMP_NOCONST_DIR/install.sh"
printf '%s\n' '$EmbeddedReleaseVersion = "__PENGUIN_RELEASE_VERSION__"' \
  > "$STAMP_NOCONST_DIR/install.ps1"
(cd "$STAMP_NOCONST_DIR" && TEST_RELEASE_TAG=v9.8.7 GITHUB_SHA="$STAMP_SHA" sh -e "$STAMP_SCRIPT") \
  > "$WORK_DIR/stamp-no-commit-const.output"
grep -Fq 'Legacy tag without a BUILD_COMMIT constant' "$WORK_DIR/stamp-no-commit-const.output" \
  || fail_test "release workflow did not use the legacy path for a missing BUILD_COMMIT"
grep -Fq 'export const VERSION = "9.8.7";' "$STAMP_NOCONST_DIR/packages/core/src/index.ts" \
  || fail_test "release workflow failed to stamp a tag without BUILD_COMMIT"

STAMP_LEGACY_DIR="$WORK_DIR/stamp-legacy"
make_stamp_case "$STAMP_LEGACY_DIR"
printf '%s\n' 'legacy POSIX installer' > "$STAMP_LEGACY_DIR/install.sh"
printf '%s\n' 'legacy PowerShell installer' > "$STAMP_LEGACY_DIR/install.ps1"
(cd "$STAMP_LEGACY_DIR" && TEST_RELEASE_TAG=v9.8.7 GITHUB_SHA="$STAMP_SHA" sh -e "$STAMP_SCRIPT") \
  > "$WORK_DIR/stamp-legacy.output"
grep -Fq 'leaving installers unstamped' "$WORK_DIR/stamp-legacy.output" \
  || fail_test "release workflow did not use the legacy installer path"
grep -Fq 'legacy POSIX installer' "$STAMP_LEGACY_DIR/install.sh" \
  || fail_test "release workflow changed the legacy POSIX installer"
grep -Fq 'legacy PowerShell installer' "$STAMP_LEGACY_DIR/install.ps1" \
  || fail_test "release workflow changed the legacy PowerShell installer"

for inconsistent_side in posix powershell; do
  STAMP_INCONSISTENT_DIR="$WORK_DIR/stamp-inconsistent-$inconsistent_side"
  make_stamp_case "$STAMP_INCONSISTENT_DIR"
  printf '%s\n' 'legacy POSIX installer' > "$STAMP_INCONSISTENT_DIR/install.sh"
  printf '%s\n' 'legacy PowerShell installer' > "$STAMP_INCONSISTENT_DIR/install.ps1"
  if [ "$inconsistent_side" = posix ]; then
    printf '%s\n' 'EMBEDDED_RELEASE_VERSION="__PENGUIN_RELEASE_VERSION__"' \
      > "$STAMP_INCONSISTENT_DIR/install.sh"
  else
    printf '%s\n' '$EmbeddedReleaseVersion = "__PENGUIN_RELEASE_VERSION__"' \
      > "$STAMP_INCONSISTENT_DIR/install.ps1"
  fi
  if (cd "$STAMP_INCONSISTENT_DIR" && TEST_RELEASE_TAG=v9.8.7 GITHUB_SHA="$STAMP_SHA" \
    sh -e "$STAMP_SCRIPT") > /dev/null 2>&1; then
    fail_test "release workflow accepted inconsistent $inconsistent_side installer markers"
  fi
done

# Model the release workflow's installer stamping without changing the source installer.
STAMPED_INSTALLER="$WORK_DIR/install-v0.0.0-test.sh"
grep -q 'EMBEDDED_RELEASE_VERSION="__PENGUIN_RELEASE_VERSION__"' "$ROOT_DIR/install.sh" \
  || fail_test "POSIX installer release-version token is missing"
sed 's/__PENGUIN_RELEASE_VERSION__/v0.0.0-test/' "$ROOT_DIR/install.sh" > "$STAMPED_INSTALLER"
chmod +x "$STAMPED_INSTALLER"

# --- Canonical layout: flat bundles, exact member set, byte-identical installers, both
#     checksum layers valid. ---
for target in linux-x64 linux-arm64 darwin-x64 darwin-arm64 universal; do
  bundle="$ARTIFACT_DIR/penguin-$target.tar.gz"
  [ -f "$bundle" ] || fail_test "missing $(basename "$bundle")"
  (cd "$ARTIFACT_DIR" && sha256sum -c "$(basename "$bundle").sha256" >/dev/null) \
    || fail_test "outer checksum failed for $(basename "$bundle")"
  members="$(tar -tzf "$bundle" | sed 's#^\./##' | sed '/^$/d' | LC_ALL=C sort)"
  expected="$(printf '%s\n' install.sh payload.tar.gz payload.tar.gz.sha256 | LC_ALL=C sort)"
  [ "$members" = "$expected" ] || fail_test "$(basename "$bundle") has an unexpected layout"
  extracted="$WORK_DIR/layout-$target"
  mkdir -p "$extracted"
  tar -xzf "$bundle" -C "$extracted"
  [ -x "$extracted/install.sh" ] || fail_test "$(basename "$bundle") installer is not executable"
  cmp -s "$ROOT_DIR/install.sh" "$extracted/install.sh" \
    || fail_test "$(basename "$bundle") installer differs from the repository installer"
  (cd "$extracted" && sha256sum -c payload.tar.gz.sha256 >/dev/null) \
    || fail_test "$(basename "$bundle") payload checksum failed"
  cmp -s "$PAYLOAD_DIR/$target.tar.gz" "$extracted/payload.tar.gz" \
    || fail_test "$(basename "$bundle") payload differs from its input"
done

windows_bundle="$ARTIFACT_DIR/penguin-win32-x64.zip"
[ -f "$windows_bundle" ] || fail_test "missing penguin-win32-x64.zip"
(cd "$ARTIFACT_DIR" && sha256sum -c penguin-win32-x64.zip.sha256 >/dev/null) \
  || fail_test "outer checksum failed for penguin-win32-x64.zip"
members="$(unzip -Z1 "$windows_bundle" | LC_ALL=C sort)"
expected="$(printf '%s\n' install.cmd install.ps1 payload.zip payload.zip.sha256 | LC_ALL=C sort)"
[ "$members" = "$expected" ] || fail_test "penguin-win32-x64.zip has an unexpected layout"
extracted="$WORK_DIR/layout-win32-x64"
mkdir -p "$extracted"
(cd "$extracted" && unzip -q "$windows_bundle")
cmp -s "$ROOT_DIR/install.ps1" "$extracted/install.ps1" \
  || fail_test "Windows bundle installer differs from the repository installer"
cmp -s "$ROOT_DIR/install.cmd" "$extracted/install.cmd" \
  || fail_test "Windows bundle install.cmd differs from the repository entry point"
(cd "$extracted" && sha256sum -c payload.zip.sha256 >/dev/null) \
  || fail_test "Windows bundle payload checksum failed"
cmp -s "$PAYLOAD_DIR/win32-x64.zip" "$extracted/payload.zip" \
  || fail_test "Windows bundle payload differs from its input"

# --- Offline install: extract the bundle once and run its installer, with a curl that always
#     fails first on PATH — the offline path must never touch the network. ---
cat > "$STUB_BIN/curl" <<'EOF'
#!/bin/sh
echo "unexpected network access: curl $*" >&2
exit 7
EOF
chmod +x "$STUB_BIN/curl"

OFFLINE_DIR="$WORK_DIR/offline"
OFFLINE_INSTALL="$WORK_DIR/offline-install"
mkdir -p "$OFFLINE_DIR"
tar -xzf "$ARTIFACT_DIR/$HOST_ASSET" -C "$OFFLINE_DIR"
HOME="$TEST_HOME" PENGUIN_INSTALL_DIR="$OFFLINE_INSTALL" PATH="$STUB_BIN:$PATH" \
  sh "$OFFLINE_DIR/install.sh" >/dev/null \
  || fail_test "offline install from the extracted bundle failed"
[ "$("$OFFLINE_INSTALL/bin/penguin" --version)" = "fixture-old" ] \
  || fail_test "offline install did not produce a working command"

# A second installation beside the first leaves `penguin` with the first: with
# --no-modify-path the ~/.local/bin symlink is not repointed.
SECOND_INSTALL="$WORK_DIR/offline-second-install"
HOME="$TEST_HOME" PENGUIN_INSTALL_DIR="$SECOND_INSTALL" PATH="$STUB_BIN:$PATH" \
  sh "$OFFLINE_DIR/install.sh" --no-modify-path >/dev/null \
  || fail_test "second install with --no-modify-path failed"
[ "$("$SECOND_INSTALL/bin/penguin" --version)" = "fixture-old" ] \
  || fail_test "second install did not produce a working command"
[ "$(readlink "$TEST_HOME/.local/bin/penguin")" = "$OFFLINE_INSTALL/bin/penguin" ] \
  || fail_test "--no-modify-path repointed the penguin symlink at the second installation"
# The same flag arrives through `sh -s --`, which is how a machine install passes it.
THIRD_INSTALL="$WORK_DIR/offline-third-install"
HOME="$TEST_HOME" PENGUIN_INSTALL_DIR="$THIRD_INSTALL" PENGUIN_ARCHIVE="$ARTIFACT_DIR/$HOST_ASSET" \
  PATH="$STUB_BIN:$PATH" sh -s -- --no-modify-path < "$OFFLINE_DIR/install.sh" >/dev/null \
  || fail_test "install over stdin with --no-modify-path failed"
[ "$(readlink "$TEST_HOME/.local/bin/penguin")" = "$OFFLINE_INSTALL/bin/penguin" ] \
  || fail_test "--no-modify-path over stdin repointed the penguin symlink"

# The stamped installer inside a released bundle must still prefer its sibling payload and
# never resolve metadata or download an online asset.
STAMPED_OFFLINE_DIR="$WORK_DIR/offline-stamped"
STAMPED_OFFLINE_INSTALL="$WORK_DIR/offline-stamped-install"
mkdir -p "$STAMPED_OFFLINE_DIR"
cp "$STAMPED_INSTALLER" "$STAMPED_OFFLINE_DIR/install.sh"
cp "$OFFLINE_DIR/payload.tar.gz" "$OFFLINE_DIR/payload.tar.gz.sha256" "$STAMPED_OFFLINE_DIR/"
HOME="$TEST_HOME" PENGUIN_INSTALL_DIR="$STAMPED_OFFLINE_INSTALL" PATH="$STUB_BIN:$PATH" \
  sh "$STAMPED_OFFLINE_DIR/install.sh" >/dev/null \
  || fail_test "stamped offline installer unexpectedly touched the network"

# A corrupted extracted payload must be rejected by the sealed checksum.
CORRUPT_DIR="$WORK_DIR/offline-corrupt"
mkdir -p "$CORRUPT_DIR"
tar -xzf "$ARTIFACT_DIR/$HOST_ASSET" -C "$CORRUPT_DIR"
printf 'corruption' >> "$CORRUPT_DIR/payload.tar.gz"
set +e
HOME="$TEST_HOME" PENGUIN_INSTALL_DIR="$WORK_DIR/offline-corrupt-install" PATH="$STUB_BIN:$PATH" \
  sh "$CORRUPT_DIR/install.sh" >/dev/null 2>&1
status=$?
set -e
[ "$status" -ne 0 ] || fail_test "corrupted offline payload was not rejected"

# --- Local archives: the canonical bundle and a bare payload both install; a failing upgrade
#     rolls back to the previous installation. ---
LOCAL_INSTALL="$TEST_HOME/.penguin"
HOME="$TEST_HOME" PENGUIN_INSTALL_DIR="$LOCAL_INSTALL" \
  sh "$ROOT_DIR/install.sh" --archive "$ARTIFACT_DIR/$HOST_ASSET" >/dev/null \
  || fail_test "--archive with the canonical bundle failed"

payload_archive="$WORK_DIR/payload.tar.gz"
cp "$PAYLOAD_DIR/$HOST_TARGET.tar.gz" "$payload_archive"
write_sha256 "$payload_archive"
HOME="$TEST_HOME" PENGUIN_INSTALL_DIR="$LOCAL_INSTALL" \
  sh "$ROOT_DIR/install.sh" --archive "$payload_archive" >/dev/null \
  || fail_test "--archive with a bare payload failed"

failure_archive="$WORK_DIR/final-failure.tar.gz"
make_posix_payload "$HOST_TARGET" "$failure_archive" final-failure
write_sha256 "$failure_archive"
set +e
HOME="$TEST_HOME" PENGUIN_INSTALL_DIR="$LOCAL_INSTALL" \
  sh "$ROOT_DIR/install.sh" --archive "$failure_archive" >/dev/null 2>&1
status=$?
set -e
[ "$status" -ne 0 ] || fail_test "failing POSIX upgrade unexpectedly succeeded"
[ "$("$LOCAL_INSTALL/bin/penguin" --version)" = "fixture-old" ] \
  || fail_test "previous POSIX installation was not restored"

# --- Pinned-directory upgrade: emulate a filesystem that refuses to rename in-use directories
#     (overlayfs reports EBUSY when `penguin update` replaces the very lib/ its own process runs
#     from). mv/rmdir stubs refuse directory renames that touch the installed lib, forcing
#     relocate_dir through its per-entry and copy fallbacks and the husk-reuse path. ---
PINNED_LIB="$LOCAL_INSTALL/lib"
export PINNED_LIB
cat > "$STUB_BIN/mv" <<'EOF'
#!/bin/sh
if [ -d "$1" ]; then
  case "$1" in
    "$PINNED_LIB" | "$PINNED_LIB"/*)
      echo "mv: cannot move '$1': Device or resource busy" >&2
      exit 1
      ;;
  esac
fi
exec /bin/mv "$@"
EOF
cat > "$STUB_BIN/rmdir" <<'EOF'
#!/bin/sh
case "$1" in
  "$PINNED_LIB")
    echo "rmdir: failed to remove '$1': Device or resource busy" >&2
    exit 1
    ;;
esac
exec /bin/rmdir "$@"
EOF
chmod +x "$STUB_BIN/mv" "$STUB_BIN/rmdir"

pinned_archive="$WORK_DIR/pinned-upgrade.tar.gz"
make_posix_payload "$HOST_TARGET" "$pinned_archive" success fixture-upgraded
write_sha256 "$pinned_archive"
HOME="$TEST_HOME" PENGUIN_INSTALL_DIR="$LOCAL_INSTALL" PATH="$STUB_BIN:$PATH" \
  sh "$ROOT_DIR/install.sh" --archive "$pinned_archive" >/dev/null \
  || fail_test "upgrade with a pinned lib directory failed"
rm -f "$STUB_BIN/mv" "$STUB_BIN/rmdir"
[ "$("$LOCAL_INSTALL/bin/penguin" --version)" = "fixture-upgraded" ] \
  || fail_test "pinned-lib upgrade did not install the new version"
[ -f "$LOCAL_INSTALL/lib/vendor/data.txt" ] \
  || fail_test "pinned-lib upgrade lost the copied lib subdirectory"
[ -z "$(ls -A "$LOCAL_INSTALL" | grep -E '^\.(old|staging)\.' || :)" ] \
  || fail_test "pinned-lib upgrade left staging or backup directories behind"

# --- Online flow through a stubbed curl. The canonical bundle is served for current releases;
#     MODE=legacy serves a pre-0.1.6 program archive, which must still install from a pinned
#     version. Checksum failures and download failures must fail without any fallback. ---
LEGACY_ARCHIVE="$WORK_DIR/legacy.tar.gz"
make_posix_payload "$HOST_TARGET" "$LEGACY_ARCHIVE"
write_sha256 "$LEGACY_ARCHIVE"

BAD_DIR="$WORK_DIR/bad-bundle"
mkdir -p "$BAD_DIR"
tar -xzf "$ARTIFACT_DIR/$HOST_ASSET" -C "$BAD_DIR"
printf '%064d  payload.tar.gz\n' 0 > "$BAD_DIR/payload.tar.gz.sha256"
BAD_BUNDLE="$WORK_DIR/bad-bundle.tar.gz"
tar -czf "$BAD_BUNDLE" -C "$BAD_DIR" .
write_sha256 "$BAD_BUNDLE"

cat > "$STUB_BIN/curl" <<'EOF'
#!/bin/sh
set -eu
output=""
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) output="$2"; shift 2 ;;
    -H | --header | --connect-timeout | --max-time | --speed-limit | --speed-time) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
printf '%s\n' "$url" >> "$REQUEST_LOG"
base="${url##*/}"
# A fixture host that never answers, used to drive the transport-failure fallback.
case "$MODE:$url" in
  primary-network:https://primary.example.test/*) exit 7 ;;
esac
case "$MODE:$base" in
  outer-sha-mismatch:penguin-*.sha256) printf '%064d  %s\n' 0 "${base%.sha256}" > "$output" ;;
  outer-sha-mismatch:penguin-*) cp "$ARTIFACT_DIR/$base" "$output" ;;
  inner-sha-mismatch:penguin-*.sha256) cp "$BAD_BUNDLE.sha256" "$output" ;;
  inner-sha-mismatch:penguin-*) cp "$BAD_BUNDLE" "$output" ;;
  network:penguin-*) exit 7 ;;
  404:penguin-*) exit 22 ;;
  legacy:penguin-*.sha256) cp "$LEGACY_ARCHIVE.sha256" "$output" ;;
  legacy:penguin-*) cp "$LEGACY_ARCHIVE" "$output" ;;
  *:penguin-*.sha256) cp "$ARTIFACT_DIR/$base" "$output" ;;
  *:penguin-*) cp "$ARTIFACT_DIR/$base" "$output" ;;
  *) echo "unexpected fixture request: $url" >&2; exit 2 ;;
esac
EOF
chmod +x "$STUB_BIN/curl"
export ARTIFACT_DIR BAD_BUNDLE LEGACY_ARCHIVE

run_online_case() {
  name="$1"
  mode="$2"
  version="$3"
  expected="$4"
  expected_requests="$5"
  download_base_url="${6:-}"
  download_fallback_base_url="${7:-}"
  installer_path="${8:-$ROOT_DIR/install.sh}"
  source_mode="${9:-auto}"
  CASE_LOG="$WORK_DIR/$name.log"
  CASE_OUTPUT="$WORK_DIR/$name.output"
  CASE_INSTALL="$WORK_DIR/$name-install"
  : > "$CASE_LOG"
  set +e
  REQUEST_LOG="$CASE_LOG" MODE="$mode" PATH="$STUB_BIN:$PATH" \
    HOME="$WORK_DIR/$name-home" PENGUIN_INSTALL_DIR="$CASE_INSTALL" \
    PENGUIN_VERSION="$version" PENGUIN_DOWNLOAD_BASE_URL="$download_base_url" \
    PENGUIN_DOWNLOAD_FALLBACK_BASE_URL="$download_fallback_base_url" \
    PENGUIN_DOWNLOAD_SOURCE="$source_mode" \
    sh "$installer_path" >"$CASE_OUTPUT" 2>&1
  status=$?
  set -e
  if [ "$expected" = "success" ]; then
    [ "$status" -eq 0 ] || fail_test "$name unexpectedly failed"
  else
    [ "$status" -ne 0 ] || fail_test "$name unexpectedly succeeded"
  fi
  [ "$(wc -l < "$CASE_LOG" | tr -d ' ')" -eq "$expected_requests" ] \
    || fail_test "$name made an unexpected number of requests"
}

# Unstamped source-tree installer: no embedded tag, so it follows GitHub's "latest" release.
run_online_case canonical canonical "" success 2
[ "$("$WORK_DIR/canonical-install/bin/penguin" --version)" = "fixture-old" ] \
  || fail_test "canonical online install did not produce a working command"
[ "$(sed -n '1p' "$WORK_DIR/canonical.log")" = \
  "https://github.com/lmliheng/Adelie/releases/latest/download/$HOST_ASSET" ] \
  || fail_test "unstamped installer did not use the latest GitHub release"
! grep -qi "aliyuncs" "$WORK_DIR/canonical.log" \
  || fail_test "installer still reaches the retired OSS mirror"

# A stamped release installer uses its own immutable tag and never resolves "latest".
run_online_case stamped canonical "" success 2 "" "" "$STAMPED_INSTALLER"
[ "$(sed -n '1p' "$WORK_DIR/stamped.log")" = \
  "https://github.com/lmliheng/Adelie/releases/download/v0.0.0-test/$HOST_ASSET" ] \
  || fail_test "stamped installer did not select its own immutable release"
! grep -q "/latest/" "$WORK_DIR/stamped.log" \
  || fail_test "stamped installer unexpectedly resolved the latest release"

# GitHub is an accepted explicit source mode and behaves like auto.
run_online_case stamped-github canonical "" success 2 "" "" "$STAMPED_INSTALLER" github
grep -q "github.com/.*/releases/download/v0.0.0-test/$HOST_ASSET\$" "$WORK_DIR/stamped-github.log" \
  || fail_test "stamped installer did not honor explicit GitHub mode"

# The retired OSS mode is rejected before any request leaves the process.
run_online_case source-mode-oss canonical "" failure 0 "" "" "$ROOT_DIR/install.sh" oss
grep -q "PENGUIN_DOWNLOAD_SOURCE must be auto or github" "$WORK_DIR/source-mode-oss.output" \
  || fail_test "retired PENGUIN_DOWNLOAD_SOURCE=oss was not rejected"

# The speed probe is gone: its switch must not exist in either installer...
! grep -q "PENGUIN_DOWNLOAD_SPEED_PROBE" "$ROOT_DIR/install.sh" \
  || fail_test "install.sh still reads PENGUIN_DOWNLOAD_SPEED_PROBE"
! grep -q "PENGUIN_DOWNLOAD_SPEED_PROBE" "$ROOT_DIR/install.ps1" \
  || fail_test "install.ps1 still reads PENGUIN_DOWNLOAD_SPEED_PROBE"
# ...and setting it must not change the download flow.
SPEED_PROBE_LOG="$WORK_DIR/speed-probe-ignored.log"
: > "$SPEED_PROBE_LOG"
REQUEST_LOG="$SPEED_PROBE_LOG" MODE=canonical PATH="$STUB_BIN:$PATH" \
  HOME="$WORK_DIR/speed-probe-ignored-home" PENGUIN_INSTALL_DIR="$WORK_DIR/speed-probe-ignored-install" \
  PENGUIN_DOWNLOAD_SPEED_PROBE=1 PENGUIN_DOWNLOAD_SOURCE=auto \
  sh "$ROOT_DIR/install.sh" >"$WORK_DIR/speed-probe-ignored.output" 2>&1 \
  || fail_test "install failed while PENGUIN_DOWNLOAD_SPEED_PROBE was set"
[ "$(wc -l < "$SPEED_PROBE_LOG" | tr -d ' ')" -eq 2 ] \
  || fail_test "PENGUIN_DOWNLOAD_SPEED_PROBE still changes the download flow"

# An explicit base URL overrides source selection entirely.
run_online_case download-base-override canonical "" success 2 \
  "https://mirror.example.test/releases/v0.0.0-test"
[ "$(sed -n '1p' "$WORK_DIR/download-base-override.log")" = \
  "https://mirror.example.test/releases/v0.0.0-test/$HOST_ASSET" ] \
  || fail_test "download base override did not take precedence"
grep -q "configured mirror" "$WORK_DIR/download-base-override.output" \
  || fail_test "download base override did not label the configured mirror"

# A transport failure on the primary base URL falls back to the configured fallback.
run_online_case download-fallback primary-network "" success 3 \
  "https://primary.example.test/releases/v0.0.0-test" \
  "https://fallback.example.test/releases/v0.0.0-test"
[ "$(sed -n '1p' "$WORK_DIR/download-fallback.log")" = \
  "https://primary.example.test/releases/v0.0.0-test/$HOST_ASSET" ] \
  || fail_test "download fallback did not try the primary source first"
grep -q "fallback.example.test/releases/v0.0.0-test/$HOST_ASSET\$" "$WORK_DIR/download-fallback.log" \
  || fail_test "download fallback did not use the configured fallback"

# A fallback without a base URL is ignored: the stamped installer keeps its own tag.
run_online_case fallback-without-base canonical "" success 2 "" \
  "https://example.invalid/releases/v0.0.0-test" "$STAMPED_INSTALLER"
! grep -q "example.invalid" "$WORK_DIR/fallback-without-base.log" \
  || fail_test "fallback without base should not override the source-mode download"
grep -q "releases/download/v0.0.0-test/$HOST_ASSET\$" "$WORK_DIR/fallback-without-base.log" \
  || fail_test "fallback without base did not keep the release's own tag"

run_online_case outer-mismatch outer-sha-mismatch "" failure 2
run_online_case inner-mismatch inner-sha-mismatch "" failure 2
run_online_case latest-404 404 "" failure 1
run_online_case pinned-network network v0.1.4 failure 1
run_online_case pinned-legacy legacy v0.1.4 success 2
[ "$(sed -n '1p' "$WORK_DIR/pinned-legacy.log")" = \
  "https://github.com/lmliheng/Adelie/releases/download/v0.1.4/$HOST_ASSET" ] \
  || fail_test "pinned legacy did not prefer the pinned release asset"

echo "Installer bundle, offline, rollback and online tests passed."
