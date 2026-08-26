// icons.mjs — one place that turns a game texture path into a site icon path.
//
//   "gfx/interface/icons/goods_icons/grain.dds" + "goods" → "img/goods/grain.png"
//
// Returns null when the entry has no texture at all (pm_dummy and friends) —
// never "img/dir/.png", which the audit would flag as a missing file and pages
// would render as a broken image.

export function iconPath(texture, dir) {
  const file = String(texture ?? '').split(/[\\/]/).pop()?.replace(/\.dds$/i, '');
  return file ? `img/${dir}/${file}.png` : null;
}
