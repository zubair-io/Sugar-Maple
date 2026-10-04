#!/bin/sh
# Maple's post-clone pattern, adapted to Sugar Maple's Angular dependencies.
# Everything installs within this build; no sibling checkout or global tools.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=${CI_PRIMARY_REPOSITORY_PATH:-$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)}
BUN_VERSION=1.4.2
case $(uname -m) in
  arm64) BUN_ARCH=aarch64 ;;
  x86_64) BUN_ARCH=x64 ;;
  *) echo 'error: Unsupported Xcode Cloud architecture' >&2; exit 1 ;;
esac
BOOTSTRAP=$(mktemp -d "${TMPDIR:-/tmp}/sugar-maple-bun.XXXXXX")
trap 'rm -rf "$BOOTSTRAP"' EXIT HUP INT TERM
curl --fail --location --retry 3 --retry-all-errors \
  "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-darwin-${BUN_ARCH}.zip" \
  --output "$BOOTSTRAP/bun.zip"
unzip -q "$BOOTSTRAP/bun.zip" -d "$BOOTSTRAP"
BUN="$BOOTSTRAP/bun-darwin-${BUN_ARCH}/bun"
[ "$($BUN --version)" = "$BUN_VERSION" ] || { echo 'error: Bun version mismatch' >&2; exit 1; }
cd "$REPO_ROOT"
"$BUN" install --frozen-lockfile
bash tools/build-editor.sh
