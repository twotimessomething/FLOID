#!/usr/bin/env bash
#
# Capture one App Store raw screenshot of the running FLOID window.
#
#   ./scripts/capture-shot.sh 01-overview
#   ./scripts/capture-shot.sh 02-drag 8      # 8s delay — start the drag, hold
#   ./scripts/capture-shot.sh 02-drag 8 --cursor   # include the pointer
#
# Writes docs/mac-app-store/screenshots/raw/<name>.png, then run
#   node scripts/generate-store-screenshots.mjs --shadow
#
# Why this exists rather than ⌘⇧4-Space: macOS will not take a keyboard
# screenshot while the mouse button is held, so a mid-drag frame cannot be
# captured by hand — which is how 02-drag ended up cropped out of a full-screen
# grab at a different size from the rest. `screencapture -T` is timer-driven,
# not input-driven, so it fires happily mid-gesture; `-l<windowid>` keeps it a
# real window capture, so every shot has identical geometry.
set -euo pipefail

NAME="${1:-}"
DELAY="${2:-5}"
CURSOR=""
for a in "$@"; do [ "$a" = "--cursor" ] && CURSOR="-C"; done
[ -n "$NAME" ] || { echo "usage: $0 <name> [delay-seconds]" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/docs/mac-app-store/screenshots/raw/${NAME%.png}.png"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/win.swift" <<'SWIFT'
import CoreGraphics
import Foundation
guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements],
                                            kCGNullWindowID) as? [[String: Any]] else { exit(1) }
for w in list {
    guard (w[kCGWindowOwnerName as String] as? String ?? "").lowercased() == "floid",
          (w[kCGWindowLayer as String] as? Int ?? -1) == 0 else { continue }
    let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let ww = (b["Width"] as? Double) ?? 0, hh = (b["Height"] as? Double) ?? 0
    guard ww > 200, hh > 200 else { continue }
    print("\(w[kCGWindowNumber as String] as? Int ?? -1) \(Int(ww)) \(Int(hh))")
    exit(0)
}
FileHandle.standardError.write("No on-screen FLOID window found — is the app running?\n".data(using: .utf8)!)
exit(1)
SWIFT

# CGWindowListCopyWindowInfo returns front-to-back, so this is whichever FLOID
# window you last clicked. With more than one instance open, click the right
# one first.
read -r WID WPT HPT < <(swift "$TMP/win.swift")
echo "  window $WID — ${WPT}x${HPT} pt (frontmost FLOID)"

# Geometry only has to be consistent across the set; the generator trims each
# capture to its opaque window box, so shadow-or-not no longer matters.
REF="$ROOT/docs/mac-app-store/screenshots/raw/01-overview.png"
if [ -f "$REF" ] && [ "${NAME%.png}" != "01-overview" ]; then
  REFPT="$(sips -g pixelWidth "$REF" | awk '/pixelWidth/{print $2/2}')"
  [ "$WPT" = "$REFPT" ] || echo "  ⚠ 01-overview was captured at ${REFPT}pt wide — resize to match, or the set will scale unevenly"
fi

echo "  capturing in ${DELAY}s — switch to FLOID and hold the gesture…"
screencapture -T "$DELAY" -l"$WID" -x $CURSOR "$OUT"
sips -g pixelWidth -g pixelHeight "$OUT" | awk '/pixel/{printf "  %s\n", $0}'
echo "  → $OUT"
