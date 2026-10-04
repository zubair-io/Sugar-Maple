#!/bin/bash
# Sugar Maple's universal Developer ID download; Xcode Cloud owns TestFlight.
set -euo pipefail
REPO_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
ARCHIVE_ONLY=false
case ${1:-} in
  --archive-only) ARCHIVE_ONLY=true ;;
  '') ;;
  *) echo 'Usage: RELEASE_VERSION=x.y.z tools/release-mac.sh [--archive-only]' >&2; exit 2 ;;
esac
VERSION=${RELEASE_VERSION:?Set RELEASE_VERSION to MAJOR.MINOR.PATCH}
BUILD_NUMBER=${RELEASE_BUILD_NUMBER:-1}
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'error: Invalid release version' >&2; exit 1; }
[[ "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]] || { echo 'error: Invalid release build number' >&2; exit 1; }
APPLE_TEAM_ID=${APPLE_TEAM_ID:-QREP66JW5U}
SIGNING_IDENTITY=${SIGNING_IDENTITY:-Developer ID Application: Zubair Lawrence (QREP66JW5U)}
if [ "$ARCHIVE_ONLY" = false ]; then
  : "${NOTARY_KEY_PATH:?Set NOTARY_KEY_PATH}"
  : "${APPSTORE_KEY_ID:?Set APPSTORE_KEY_ID}"
  : "${APPSTORE_ISSUER_ID:?Set APPSTORE_ISSUER_ID}"
  [ -f "$NOTARY_KEY_PATH" ] || { echo 'error: Notarization key file missing' >&2; exit 1; }
fi
WORK=$(mktemp -d "${TMPDIR:-/tmp}/sugar-maple-release.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
OUT=${RELEASE_OUTPUT_DIR:-$REPO_ROOT/build/releases/$VERSION}
mkdir -p "$OUT"
OUT=$(CDPATH='' cd -- "$OUT" && pwd)
DMG="$OUT/SugarMaple-macOS-$VERSION.dmg"
[ ! -e "$DMG" ] || { echo 'error: Release DMG already exists; use a fresh output directory' >&2; exit 1; }
if [ "$ARCHIVE_ONLY" = true ] && [ -e "$OUT/SugarMaple.xcarchive" ]; then
  echo 'error: Archive already exists; use a fresh output directory' >&2; exit 1
fi
bash "$REPO_ROOT/tools/build-editor.sh"
xcodebuild -project "$REPO_ROOT/src/apple/Sugar Maple.xcodeproj" \
  -scheme 'Sugar Maple' -configuration Release -destination 'generic/platform=macOS' \
  -derivedDataPath "$WORK/DerivedData" \
  -archivePath "$WORK/SugarMaple.xcarchive" archive \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="$SIGNING_IDENTITY" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" MARKETING_VERSION="$VERSION" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" ARCHS='arm64 x86_64' ONLY_ACTIVE_ARCH=NO \
  COMPILER_INDEX_STORE_ENABLE=NO
APP="$WORK/SugarMaple.xcarchive/Products/Applications/Sugar Maple.app"
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -d --verbose=4 "$APP" 2> "$WORK/signature.txt"
grep -Fq "Authority=Developer ID Application:" "$WORK/signature.txt"
grep -Fxq "TeamIdentifier=$APPLE_TEAM_ID" "$WORK/signature.txt"
grep -Fxq 'Identifier=app.justmaple.SugarMaple' "$WORK/signature.txt"
grep -q 'flags=.*runtime' "$WORK/signature.txt"
for arch in arm64 x86_64; do
  lipo "$APP/Contents/MacOS/Sugar Maple" -verify_arch "$arch"
done
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")" = "$VERSION"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Contents/Info.plist")" = "$BUILD_NUMBER"
test -f "$APP/Contents/Resources/Editor/index.html"
if [ "$ARCHIVE_ONLY" = true ]; then
  ditto "$WORK/SugarMaple.xcarchive" "$OUT/SugarMaple.xcarchive"
  echo "Verified universal signed archive: $OUT/SugarMaple.xcarchive (not notarized)"
  exit 0
fi
notarize() {
  local target=$1 report=$2
  xcrun notarytool submit "$target" --key "$NOTARY_KEY_PATH" \
    --key-id "$APPSTORE_KEY_ID" --issuer "$APPSTORE_ISSUER_ID" \
    --wait --timeout 45m --output-format json > "$report"
  if [ "$(/usr/bin/plutil -extract status raw -o - "$report")" != Accepted ]; then
    echo "error: Notarization was not accepted; inspect $report" >&2
    return 1
  fi
  xcrun stapler staple "$target"
  xcrun stapler validate "$target"
}
ditto -c -k --keepParent "$APP" "$WORK/notarize.zip"
# Submit a zip, then attach its accepted ticket to the enclosed app.
xcrun notarytool submit "$WORK/notarize.zip" --key "$NOTARY_KEY_PATH" \
  --key-id "$APPSTORE_KEY_ID" --issuer "$APPSTORE_ISSUER_ID" \
  --wait --timeout 45m --output-format json > "$OUT/app-notarization.json"
test "$(/usr/bin/plutil -extract status raw -o - "$OUT/app-notarization.json")" = Accepted
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
spctl --assess --type execute --verbose=2 "$APP"
mkdir "$WORK/dmg"
ditto "$APP" "$WORK/dmg/Sugar Maple.app"
ln -s /Applications "$WORK/dmg/Applications"
hdiutil create -volname 'Sugar Maple' -srcfolder "$WORK/dmg" -format UDZO "$DMG"
codesign --sign "$SIGNING_IDENTITY" --timestamp "$DMG"
codesign --verify --verbose=2 "$DMG"
notarize "$DMG" "$OUT/dmg-notarization.json"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"
(cd "$OUT" && shasum -a 256 "$(basename "$DMG")" > SHA256SUMS.txt)
echo "Signed, notarized and stapled download: $DMG"
