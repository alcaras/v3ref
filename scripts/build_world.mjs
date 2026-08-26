// build_world.mjs — emits:
//   src/data/countries.json  every country definition (1836 + formable/dynamic)
//   src/data/states.json     land state regions: arable land/types, resource
//                            caps, discoverables, traits; + state trait catalog
//
// Sea/ocean state regions carry no subsistence building — filtered out.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, asArray, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
import { loadModifiers } from './lib/modifiers.mjs';

const loc = loadLoc();
const mods = await loadModifiers(loc);
const root = dataRoot();

const [countries, stateRegions, stateTraits, strategicRegions] = await Promise.all([
  parseFolder(join(root, 'game/common/country_definitions')),
  parseFolder(join(root, 'game/map_data/state_regions')),
  parseFolder(join(root, 'game/common/state_traits')),
  parseFolder(join(root, 'game/common/strategic_regions')),
]);

// ── Colors: tags ship rgb {0-255} triplets or hsv{0-1} blocks ───────
function toHex(color) {
  if (!color) return null;
  let rgb = null;
  if (Array.isArray(color) && color.length === 3 && color.every((n) => typeof n === 'number')) {
    rgb = color.some((n) => n > 1) ? color : color.map((n) => n * 255);
  } else if (typeof color === 'object') {
    const hsv = color.hsv ?? color.HSV;
    const hsv360 = color.hsv360 ?? color.HSV360;
    if (Array.isArray(hsv) && hsv.length === 3) rgb = hsvToRgb(hsv[0], hsv[1], hsv[2]);
    else if (Array.isArray(hsv360) && hsv360.length === 3)
      rgb = hsvToRgb(hsv360[0] / 360, hsv360[1] / 100, hsv360[2] / 100);
    else if (Array.isArray(color.rgb)) rgb = color.rgb;
  }
  if (!rgb) return null;
  return '#' + rgb.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
}
function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return [r * 255, g * 255, b * 255];
}

// ── Countries ───────────────────────────────────────────────────────
const TIER_ORDER = ['hegemony', 'empire', 'kingdom', 'grand_principality', 'principality', 'city_state'];
const TYPE_ORDER = ['recognized', 'unrecognized', 'company', 'colonial', 'decentralized'];
const ord = (list, v) => (list.indexOf(v) >= 0 ? list.indexOf(v) : list.length);
const countryList = Object.entries(countries.entries)
  .filter(([tag]) => /^[A-Z0-9]{3}$/.test(tag))
  .map(([tag, c]) => ({
    tag,
    name: loc.name(tag),
    color: toHex(c.color),
    type: c.country_type ?? null,
    tier: c.tier ?? null,
    capital: c.capital ? { id: c.capital, name: loc.name(c.capital) } : null,
    cultures: asArray(c.cultures).flat().map((cu) => ({ id: cu, name: loc.name(cu) })),
    religion: c.religion ? { id: c.religion, name: loc.name(c.religion) } : null,
    dynamic: countries.sources[tag] === '99_dynamic.txt',
  }))
  .sort(
    (a, b) =>
      Number(a.dynamic) - Number(b.dynamic) ||
      ord(TYPE_ORDER, a.type) - ord(TYPE_ORDER, b.type) ||
      ord(TIER_ORDER, a.tier) - ord(TIER_ORDER, b.tier) ||
      a.name.localeCompare(b.name),
  );
writeFileSync(
  new URL('../src/data/countries.json', import.meta.url).pathname,
  stableStringify({ countries: countryList }),
);

// ── States ──────────────────────────────────────────────────────────
const regionOfState = {};
for (const [rId, r] of Object.entries(strategicRegions.entries)) {
  for (const s of asArray(r.states).flat()) regionOfState[s] = rId;
}

const traitCatalog = Object.entries(stateTraits.entries).map(([id, t]) => ({
  id,
  name: loc.name(id),
  modifiers: mods.formatBag(Object.assign({}, ...asArray(t.modifier))),
  states: [],
}));
const traitById = Object.fromEntries(traitCatalog.map((t) => [t.id, t]));

const stateList = Object.entries(stateRegions.entries)
  .filter(([, s]) => s.subsistence_building)
  .map(([id, s]) => {
    const traits = asArray(s.traits).flat();
    for (const t of traits) traitById[t]?.states.push(id);
    const region = regionOfState[id] ?? null;
    // resource = { type = "bg_x" undiscovered_amount = N depleted_type=... }
    const discoverables = asArray(s.resource).map((r) => ({
      group: r?.type ?? null,
      name: r?.type ? loc.name(r.type) : null,
      amount: r?.undiscovered_amount ?? r?.discovered_amount ?? null,
    }));
    return {
      id,
      name: loc.name(id),
      region: region ? { id: region, name: loc.name(region) } : null,
      arableLand: s.arable_land ?? 0,
      arableResources: asArray(s.arable_resources).flat().map((b) => ({
        id: b,
        slug: b.replace(/^building_/, ''),
        name: loc.name(b),
      })),
      cappedResources: Object.entries(Object.assign({}, ...asArray(s.capped_resources))).map(
        ([b, cap]) => ({ id: b, slug: b.replace(/^building_/, ''), name: loc.name(b), cap }),
      ),
      discoverables,
      traits: traits.map((t) => ({ id: t, name: loc.name(t) })),
      navalExit: s.naval_exit_id != null,
    };
  })
  .sort((a, b) => (a.region?.name ?? '').localeCompare(b.region?.name ?? '') || a.name.localeCompare(b.name));

writeFileSync(
  new URL('../src/data/states.json', import.meta.url).pathname,
  stableStringify({
    states: stateList,
    traits: traitCatalog
      .filter((t) => t.states.length)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }),
);

console.log(
  `countries.json: ${countryList.length} countries (${countryList.filter((c) => c.dynamic).length} dynamic) · ` +
    `states.json: ${stateList.length} states, ${traitCatalog.filter((t) => t.states.length).length} traits`,
);
