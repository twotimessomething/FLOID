#!/usr/bin/env bash
#
# Build, sign and package FLOID for the Mac App Store.
#
#   ./scripts/mas-build.sh              # build number defaults to 1
#   BUILD_NUMBER=2 ./scripts/mas-build.sh
#
# Produces build/FLOID.pkg, ready for Transporter.
#
# Prerequisites (see docs/mac-app-store/RELEASE-GUIDE.md, Part 2):
#   • "Apple Distribution: … (LPJ28CF2F5)" in the login keychain
#   • "3rd Party Mac Developer Installer: … (LPJ28CF2F5)" in the login keychain
#   • src-tauri/FLOID_MAS.provisionprofile — a Mac App Store distribution
#     profile for design.floid.app (gitignored: *.provisionprofile)
#
set -euo pipefail

TEAM_ID="LPJ28CF2F5"
BUNDLE_ID="design.floid.app"
PRODUCT="FLOID"
BUILD_NUMBER="${BUILD_NUMBER:-1}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="$ROOT/src-tauri/FLOID_MAS.provisionprofile"
ENTITLEMENTS="$ROOT/src-tauri/MAS-Entitlements.plist"
BUILT_APP="$ROOT/src-tauri/target/universal-apple-darwin/release/bundle/macos/$PRODUCT.app"
OUT_DIR="$ROOT/build"
STAGED_APP="$OUT_DIR/$PRODUCT.app"
PKG="$OUT_DIR/$PRODUCT.pkg"

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# --- 0. Preflight ----------------------------------------------------------
step "Preflight"

[ -f "$PROFILE" ] || fail "Missing $PROFILE — download the Mac App Store provisioning profile for $BUNDLE_ID."
[ -f "$ENTITLEMENTS" ] || fail "Missing $ENTITLEMENTS"

APP_CERT="$(security find-identity -v -p codesigning \
  | grep "Apple Distribution" | grep "$TEAM_ID" | head -1 \
  | sed -E 's/.*"(.*)"/\1/')" || true
[ -n "${APP_CERT:-}" ] || fail "No \"Apple Distribution: … ($TEAM_ID)\" certificate found. Create it at developer.apple.com → Certificates."

# The installer certificate is not a codesigning identity, so it lives in a
# different query.
INSTALLER_CERT="$(security find-identity -v \
  | grep -E "3rd Party Mac Developer Installer|Mac Installer Distribution" | grep "$TEAM_ID" | head -1 \
  | sed -E 's/.*"(.*)"/\1/')" || true
[ -n "${INSTALLER_CERT:-}" ] || fail "No Mac Installer Distribution certificate found. Create it at developer.apple.com → Certificates."

echo "  app signer:       $APP_CERT"
echo "  installer signer: $INSTALLER_CERT"
echo "  build number:     $BUILD_NUMBER"

# The profile must match the bundle id, or the upload is rejected long after
# a perfectly successful local signature.
PROFILE_APP_ID="$(security cms -D -i "$PROFILE" 2>/dev/null \
  | plutil -extract Entitlements.com\\.apple\\.application-identifier raw - -o - 2>/dev/null || echo '')"
if [ -n "$PROFILE_APP_ID" ] && [ "$PROFILE_APP_ID" != "$TEAM_ID.$BUNDLE_ID" ]; then
  fail "Profile is for '$PROFILE_APP_ID' but this app is '$TEAM_ID.$BUNDLE_ID'."
fi

# --- 1. Build --------------------------------------------------------------
step "Building universal binary (arm64 + x86_64)"
cd "$ROOT"
# tauri runs beforeBuildCommand (`npm run build`) itself — calling it here too
# would just build the frontend twice.
npx tauri build --target universal-apple-darwin --bundles app

[ -d "$BUILT_APP" ] || fail "Expected $BUILT_APP — tauri build did not produce a bundle."

# --- 2. Stage --------------------------------------------------------------
# Sign a copy, never the build output: a re-run of `tauri build` overwrites
# the bundle and would silently ship an unsigned or stale app.
step "Staging"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cp -R "$BUILT_APP" "$STAGED_APP"

lipo -info "$STAGED_APP/Contents/MacOS/"* | sed 's/^/  /'

# --- 3. Version stamp ------------------------------------------------------
# CFBundleVersion must strictly increase across uploads. Tauri writes the
# same string into both version keys, so bump the build number here — before
# signing, or the signature no longer matches the bundle.
step "Stamping CFBundleVersion = $BUILD_NUMBER"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$STAGED_APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$STAGED_APP/Contents/Info.plist" \
  | sed 's/^/  marketing version: /'

# --- 4. Embed the provisioning profile ------------------------------------
step "Embedding provisioning profile"
cp "$PROFILE" "$STAGED_APP/Contents/embedded.provisionprofile"

# --- 5. Sign ---------------------------------------------------------------
# Inside out: anything nested first, then the bundle itself. Tauri produces a
# single-executable bundle today; the loop keeps this correct if that changes.
step "Signing"
find "$STAGED_APP/Contents" -type f \( -name "*.dylib" -o -name "*.framework" \) -print0 \
  | while IFS= read -r -d '' nested; do
      codesign --force --sign "$APP_CERT" --timestamp "$nested"
    done

codesign --force --sign "$APP_CERT" \
  --entitlements "$ENTITLEMENTS" \
  --timestamp \
  "$STAGED_APP"

# --- 6. Verify -------------------------------------------------------------
step "Verifying signature"
codesign --verify --deep --strict --verbose=2 "$STAGED_APP"
echo "  --- entitlements as signed ---"
codesign -d --entitlements - --xml "$STAGED_APP" 2>/dev/null | plutil -p - | sed 's/^/  /'

# --- 7. Package ------------------------------------------------------------
step "Building installer package"
xcrun productbuild \
  --sign "$INSTALLER_CERT" \
  --component "$STAGED_APP" /Applications \
  "$PKG"

pkgutil --check-signature "$PKG" | sed 's/^/  /'

printf '\n\033[32m✓ %s\033[0m\n' "$PKG"
cat <<'NEXT'

Next:
  1. Validate:  xcrun altool --validate-app -f build/FLOID.pkg -t macos \
                  -u <apple-id> -p <app-specific-password>
  2. Upload:    open Transporter.app, drag in build/FLOID.pkg, Deliver
     (or)       xcrun altool --upload-app -f build/FLOID.pkg -t macos \
                  -u <apple-id> -p <app-specific-password>
  3. The build appears in App Store Connect → TestFlight in 5–30 minutes.
NEXT
