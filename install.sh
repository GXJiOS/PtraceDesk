#!/bin/bash
# 在接收方的 Mac 上构建、签名并安装 PtraceDesk。
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="PtraceDesk"
BUNDLE_ID="com.gxj.ptracedesk"
APP_PATH="$PROJECT_ROOT/src-tauri/target/release/bundle/macos/$APP_NAME.app"
MODE="install"
DESTINATION="/Applications"
LAUNCH=true
INSTALL_DEPS=true
STAGING_DIR=""
PRESERVE_STAGING=false

fail() { printf '错误：%s\n' "$*" >&2; exit 1; }
step() { printf '\n▸ %s\n' "$*"; }
cleanup() {
  if [ -n "$STAGING_DIR" ] && [ "$PRESERVE_STAGING" = false ]; then
    rm -rf "$STAGING_DIR"
  fi
}
trap cleanup EXIT

usage() {
  cat <<'HELP'
用法：./install.sh [选项]
  默认             安装依赖、构建、签名、安装到 /Applications 并启动
  --check          只检查构建环境
  --build-only     构建并签名 App
  --package        生成可发给同事的源码安装 ZIP
  --skip-deps      使用已安装的 npm 依赖
  --destination DIR  指定安装目录
  --no-launch      安装后不启动
  --help           显示帮助

SIGN_ID=<证书 SHA-1 或名称> ./install.sh  指定本机签名证书
SIGN_ID=- ./install.sh                 使用本地临时签名
HELP
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) MODE="check" ;;
    --build-only) MODE="build" ;;
    --package) MODE="package" ;;
    --skip-deps) INSTALL_DEPS=false ;;
    --no-launch) LAUNCH=false ;;
    --destination)
      [ "$#" -ge 2 ] && [ -n "$2" ] || fail "--destination 需要目录参数。"
      DESTINATION="$2"
      shift
      ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; fail "未知参数：$1" ;;
  esac
  shift
done

[ "$(uname -s)" = Darwin ] || fail "此安装脚本用于 macOS。"
cd "$PROJECT_ROOT"

if [ "$MODE" = package ]; then
  step "生成源码安装包"
  STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ptracedesk-source.XXXXXX")"
  SOURCE_DIR="$STAGING_DIR/$APP_NAME"
  mkdir -p "$SOURCE_DIR/src-tauri" "$SOURCE_DIR/.openai" "$PROJECT_ROOT/distribution"
  for entry in install.sh Makefile README.md package.json package-lock.json tsconfig.json vite.config.ts index.html src scripts worker tests; do
    [ -e "$entry" ] || fail "缺少源码安装包文件：$entry"
    ditto "$entry" "$SOURCE_DIR/$entry"
  done
  for entry in Cargo.toml Cargo.lock build.rs tauri.conf.json src icons capabilities; do
    [ -e "src-tauri/$entry" ] || fail "缺少 Tauri 文件：$entry"
    ditto "src-tauri/$entry" "$SOURCE_DIR/src-tauri/$entry"
  done
  ditto .openai/hosting.json "$SOURCE_DIR/.openai/hosting.json"
  if [ -d public ]; then ditto public "$SOURCE_DIR/public"; fi
  chmod +x "$SOURCE_DIR/install.sh"
  ditto -c -k --keepParent "$SOURCE_DIR" "$STAGING_DIR/$APP_NAME-source.zip"
  mv -f "$STAGING_DIR/$APP_NAME-source.zip" "$PROJECT_ROOT/distribution/$APP_NAME-source.zip"
  printf '\n源码安装包：%s\n' "$PROJECT_ROOT/distribution/$APP_NAME-source.zip"
  exit 0
fi

step "检查构建环境"
[ "$(uname -m)" = arm64 ] || fail "当前安装流程支持 Apple Silicon，请使用原生 arm64 终端。"
xcode-select -p >/dev/null 2>&1 || fail "请先运行 xcode-select --install 安装 Xcode 命令行工具。"
xcrun --find clang >/dev/null 2>&1 || fail "Xcode 命令行工具尚未就绪。"
for tool in node npm cargo rustc; do
  command -v "$tool" >/dev/null 2>&1 || fail "缺少 ${tool}，请按 README.md 准备构建环境。"
done
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit((major === 20 && minor >= 19) || major > 22 || (major === 22 && minor >= 12) ? 0 : 1)' \
  || fail "Node.js 需要 20.19+（20.x）或 22.12+。"
[ "$(rustc -vV | awk '/^host:/ {print $2}')" = aarch64-apple-darwin ] \
  || fail "请安装 Apple Silicon 原生 Rust 工具链（aarch64-apple-darwin）。"
printf 'macOS %s / %s\n' "$(sw_vers -productVersion)" "$(uname -m)"
node --version
cargo --version

if [ "$MODE" = check ]; then
  printf '\n构建环境检查通过。\n'
  exit 0
fi

if [ "$INSTALL_DEPS" = true ]; then
  step "按锁文件安装 npm 依赖"
  npm ci
else
  [ -x node_modules/.bin/tauri ] || fail "尚未安装依赖，请先运行 npm ci 或移除 --skip-deps。"
fi

step "选择本机签名"
SIGNING_ID="${SIGN_ID:-}"
if [ -z "$SIGNING_ID" ]; then
  CONFIGURED_ID="$(node -p 'require("./src-tauri/tauri.conf.json").bundle?.macOS?.signingIdentity || ""')"
  IDENTITIES="$(security find-identity -v -p codesigning 2>/dev/null || true)"
  SIGNING_ID="$(printf '%s\n' "$IDENTITIES" | awk -v preferred="$CONFIGURED_ID" '$2 == preferred && !/CSSMERR/ {print $2; exit}')"
  if [ -z "$SIGNING_ID" ]; then
    SIGNING_ID="$(printf '%s\n' "$IDENTITIES" | awk '/Apple Development/ && !/CSSMERR/ {print $2; exit}')"
  fi
  if [ -z "$SIGNING_ID" ]; then
    SIGNING_ID="$(printf '%s\n' "$IDENTITIES" | awk '/Developer ID Application/ && !/CSSMERR/ {print $2; exit}')"
  fi
  SIGNING_ID="${SIGNING_ID:--}"
fi
if [ "$SIGNING_ID" = - ]; then
  printf '使用本地临时签名（ad-hoc）。\n'
else
  printf '使用本机签名证书：%s\n' "$SIGNING_ID"
fi
BUILD_CONFIG="$(PTRACEDESK_SIGN_ID="$SIGNING_ID" node -e 'process.stdout.write(JSON.stringify({bundle:{macOS:{signingIdentity:process.env.PTRACEDESK_SIGN_ID}}}))')"

step "构建并验证 App"
# 本机构建使用当前机器的签名身份，配置覆盖仅作用于本次命令。
env -u CARGO_BUILD_TARGET -u APPLE_ID -u APPLE_PASSWORD -u APPLE_API_KEY -u APPLE_API_ISSUER -u APPLE_API_KEY_PATH \
  CARGO_TARGET_DIR="$PROJECT_ROOT/src-tauri/target" APPLE_SIGNING_IDENTITY="$SIGNING_ID" \
  npm run tauri:build -- --bundles app --config "$BUILD_CONFIG"
[ -x "$APP_PATH/Contents/MacOS/ptracedesk" ] || fail "未找到构建产物：$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"

if [ "$MODE" = build ]; then
  printf '\nApp 已构建：%s\n' "$APP_PATH"
  exit 0
fi

step "安装 App"
mkdir -p "$DESTINATION"
DESTINATION="$(cd "$DESTINATION" && pwd)"
[ -w "$DESTINATION" ] || fail "安装目录不可写，可使用 --destination 指定自己的 Applications 目录。"
TARGET_APP="$DESTINATION/$APP_NAME.app"
if [ -e "$TARGET_APP" ]; then
  EXISTING_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$TARGET_APP/Contents/Info.plist" 2>/dev/null || true)"
  [ "$EXISTING_ID" = "$BUNDLE_ID" ] || fail "目标路径已有其他内容，请换一个安装目录：$TARGET_APP"
fi
STAGING_DIR="$(mktemp -d "$DESTINATION/.ptracedesk-install.XXXXXX")"
ditto "$APP_PATH" "$STAGING_DIR/$APP_NAME.app"
codesign --verify --deep --strict "$STAGING_DIR/$APP_NAME.app"
if [ -e "$TARGET_APP" ]; then
  osascript -e 'if application id "com.gxj.ptracedesk" is running then tell application id "com.gxj.ptracedesk" to quit'
  sleep 1
  PRESERVE_STAGING=true
  mv "$TARGET_APP" "$STAGING_DIR/previous.app"
fi
if ! mv "$STAGING_DIR/$APP_NAME.app" "$TARGET_APP"; then
  if [ -e "$STAGING_DIR/previous.app" ]; then
    if mv "$STAGING_DIR/previous.app" "$TARGET_APP"; then
      PRESERVE_STAGING=false
    else
      fail "安装失败，旧版保存在 $STAGING_DIR/previous.app。"
    fi
  fi
  fail "安装失败，旧版已保留。"
fi
PRESERVE_STAGING=false
printf '\n已安装：%s\n' "$TARGET_APP"
printf '首次打开后连接自己的 ptrace 账号，再选择自己的身份。\n'
if [ "$LAUNCH" = true ]; then open "$TARGET_APP"; fi
