#!/bin/sh
# Maple's post-clone pattern, adapted to Sugar Maple's Angular dependencies.
# Everything installs within this build; no sibling checkout or global tools.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=${CI_PRIMARY_REPOSITORY_PATH:-$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)}
BUN_VERSION=1.4.2
NODE_VERSION=26.9.0
case $(uname -m) in
  arm64)
    BUN_ARCH=aarch64
    NODE_ARCH=arm64
    NODE_SHA256=6f3de7ed853ee283b4bf24b6e426618f1d357401ce5815db1866eb85eb4b05d9
    ;;
  x86_64)
    BUN_ARCH=x64
    NODE_ARCH=x64
    NODE_SHA256=06b2e742ed9025dc84adc830243b3f731956eac9c321bccd0ede384209af02a8
    ;;
  *) echo 'error: Unsupported Xcode Cloud architecture' >&2; exit 1 ;;
esac
BOOTSTRAP=$(mktemp -d "${TMPDIR:-/tmp}/sugar-maple-bun.XXXXXX")
trap 'rm -rf "$BOOTSTRAP"' EXIT HUP INT TERM
# The lockfile's node package invokes npm to install its platform binary.
# Xcode Cloud does not provide npm, so supply it only for this owned build.
curl --fail --location --retry 3 --retry-all-errors \
  "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz" \
  --output "$BOOTSTRAP/node.tar.gz"
printf '%s  %s\n' "$NODE_SHA256" "$BOOTSTRAP/node.tar.gz" | shasum -a 256 -c -
tar -xzf "$BOOTSTRAP/node.tar.gz" -C "$BOOTSTRAP"
export PATH="$BOOTSTRAP/node-v${NODE_VERSION}-darwin-${NODE_ARCH}/bin:$PATH"
[ "$(node --version)" = "v$NODE_VERSION" ] || { echo 'error: Node version mismatch' >&2; exit 1; }
curl --fail --location --retry 3 --retry-all-errors \
  "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-darwin-${BUN_ARCH}.zip" \
  --output "$BOOTSTRAP/bun.zip"
unzip -q "$BOOTSTRAP/bun.zip" -d "$BOOTSTRAP"
BUN="$BOOTSTRAP/bun-darwin-${BUN_ARCH}/bun"
[ "$($BUN --version)" = "$BUN_VERSION" ] || { echo 'error: Bun version mismatch' >&2; exit 1; }
cd "$REPO_ROOT"
"$BUN" install --frozen-lockfile
bash tools/build-editor.sh
