#!/usr/bin/env bash
# extract_art.sh — convert the game's DDS icons to PNG for the site.
# Reads from a local Victoria 3 install (gfx/ is deliberately excluded from the
# v3ref data mirror to keep it small). Requires ImageMagick (`magick`).
#
#   VIC3_APP=/path/to/Victoria 3  ./scripts/extract_art.sh
#
# Defaults to the standard macOS Steam location.
set -euo pipefail

VIC3_APP="${VIC3_APP:-$HOME/Library/Application Support/Steam/steamapps/common/Victoria 3}"
ICONS="$VIC3_APP/game/gfx/interface/icons"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/img"

if [ ! -d "$ICONS" ]; then
  echo "error: no Victoria 3 install at '$VIC3_APP' (set VIC3_APP)" >&2
  exit 1
fi

convert_dir() {
  local src="$1" dst="$2" n=0
  mkdir -p "$dst"
  for f in "$src"/*.dds; do
    [ -e "$f" ] || continue
    local base out
    base="$(basename "$f" .dds)"
    out="$dst/$base.png"
    if [ ! -f "$out" ] || [ "$f" -nt "$out" ]; then
      magick "$f" "$out" 2>/dev/null || echo "  skip (unreadable): $base" >&2
    fi
    n=$((n + 1))
  done
  echo "$dst: $n icons"
}

convert_dir "$ICONS/goods_icons" "$OUT/goods"
convert_dir "$ICONS/building_icons" "$OUT/buildings"
convert_dir "$ICONS/production_method_icons" "$OUT/pms"
convert_dir "$ICONS/pops_icons" "$OUT/pops"
convert_dir "$ICONS/law_icons" "$OUT/laws"
convert_dir "$ICONS/ideology_icons" "$OUT/ideologies"
convert_dir "$ICONS/ideology_icons/ideology_leader" "$OUT/ideologies"
convert_dir "$ICONS/ig_icons" "$OUT/igs"
convert_dir "$ICONS/institution_icons" "$OUT/institutions"
convert_dir "$ICONS/invention_icons" "$OUT/techs"
convert_dir "$ICONS/character_trait_icons" "$OUT/traits"
convert_dir "$ICONS/decree" "$OUT/decrees"
convert_dir "$ICONS/diplomatic_treaties_articles_icons" "$OUT/treaties"
convert_dir "$ICONS/central_identity_pillars_icons" "$OUT/identities"
convert_dir "$ICONS/principles_icons" "$OUT/principles"

# Site mark + favicon: the gold ingot (32px favicon from the goods icon).
if [ -f "$OUT/goods/gold.png" ]; then
  magick "$OUT/goods/gold.png" -resize 32x32 "$OUT/favicon.png"
fi
