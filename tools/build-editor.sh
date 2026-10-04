#!/bin/sh
# Use the lockfile's Node runtime: the Bun-hosted Angular CLI can stay alive
# after esbuild finishes. Shared by local Mac packaging and Xcode Cloud.
set -eu
REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
NODE="$REPO_ROOT/node_modules/.bin/node"
if [ ! -x "$NODE" ]; then
  echo 'error: Pinned Node runtime missing; run bun install --frozen-lockfile' >&2
  exit 1
fi
cd "$REPO_ROOT/src/web"
exec "$NODE" "$REPO_ROOT/node_modules/@angular/cli/bin/ng.js" build --base-href ./
