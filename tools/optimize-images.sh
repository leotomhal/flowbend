#!/usr/bin/env bash
# Verkleinert & komprimiert alle Bilder in img/ "en Block" (lokal, am Rechner).
# Voraussetzung: ImageMagick (convert) und optional pngquant.
#   macOS:  brew install imagemagick pngquant
#   Debian: sudo apt-get install imagemagick pngquant
#
# Aufruf:  bash tools/optimize-images.sh
set -euo pipefail

cd "$(dirname "$0")/.."
shopt -s nullglob

if ! command -v convert >/dev/null 2>&1; then
  echo "Fehlt: ImageMagick (convert). Bitte installieren."; exit 1
fi

echo "Verkleinere auf max. 800 px (lange Kante) + strippe Metadaten..."
for f in img/*.png img/*.jpg img/*.jpeg; do
  before=$(du -h "$f" | cut -f1)
  convert "$f" -resize '800x800>' -strip -quality 82 "$f"
  echo "  $f  ($before -> $(du -h "$f" | cut -f1))"
done

if command -v pngquant >/dev/null 2>&1; then
  echo "Komprimiere PNGs mit pngquant..."
  for f in img/*.png; do
    pngquant --force --skip-if-larger --quality=65-90 --output "$f" "$f" || true
  done
else
  echo "Hinweis: pngquant nicht gefunden – PNGs nur verkleinert, nicht quantisiert."
fi

echo "Fertig. Danach:  python3 tools/check-poses.py  zum Abgleich."
