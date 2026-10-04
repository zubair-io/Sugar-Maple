#!/bin/sh
# Version tags are the production version of record, as in Maple releases.
# Xcode Cloud assigns the monotonically increasing build number itself.
set -eu
case ${CI_TAG:-} in
  v*)
    VERSION=${CI_TAG#v}
    printf '%s\n' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || {
      echo 'error: Production tags must be vMAJOR.MINOR.PATCH' >&2; exit 1;
    }
    SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
    REPO_ROOT=${CI_PRIMARY_REPOSITORY_PATH:-$(CDPATH='' cd -- "$SCRIPT_DIR/../../.." && pwd)}
    /usr/bin/sed -E -i '' "s/(MARKETING_VERSION = )[^;]+;/\1${VERSION};/" \
      "$REPO_ROOT/src/apple/Sugar Maple.xcodeproj/project.pbxproj"
    ;;
esac
