// build_map.mjs — the interactive resource map's two artefacts.
//
//   public/img/map/states.png   a STATE-INDEX image: every pixel's red+green
//                               channels encode which state region it belongs
//                               to (idx = R + G*256; 0 = sea/unassigned).
//   public/data/map.json        per-state resource values + layer catalog.
//
// The page recolors the index image in a canvas, so one download drives every
// layer and every overlay — switching maps is a repaint, not a fetch.
//
// The game ships provinces.png (8192x3616), where each province is a unique
// flat RGB colour, and state_regions/*.txt lists the province colours in each
// state. We downsample with ImageMagick's `-sample` (NEAREST NEIGHBOUR — any
// interpolating filter would invent colours that match no province) and look
// each surviving colour up.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { dataRoot, parseFolder, idList, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';

const W = 2048, H = 904;                 // 8192x3616 halved twice; keeps state shapes
const loc = loadLoc();
const root = dataRoot();
const gen = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url).pathname, 'utf8'));

// ── Province colour → state ─────────────────────────────────────────
const { entries: regions } = await parseFolder(join(root, 'game/map_data/state_regions'));
const stateOfColour = new Map();          // packed RGB -> state id
for (const [stateId, region] of Object.entries(regions)) {
  for (const hex of idList(region.provinces)) {
    // "x0974E5" -> 0x0974E5
    const packed = parseInt(String(hex).replace(/^x/i, ''), 16);
    if (!Number.isNaN(packed)) stateOfColour.set(packed, stateId);
  }
}

// ── Which states we actually have data for ──────────────────────────
const { states } = gen('states.json');
const byId = new Map(states.map((s) => [s.id, s]));

// Index 0 is reserved for "no state here" (sea, lakes, unassigned).
const order = states.map((s) => s.id);
const indexOf = new Map(order.map((id, i) => [id, i + 1]));

// ── Downsample the province bitmap and translate it ─────────────────
const provPng = join(root, 'game/map_data/provinces.png');
const raw = execFileSync(
  'magick',
  [provPng, '-sample', `${W}x${H}!`, 'RGB:-'],
  { maxBuffer: 1 << 30 },
);
if (raw.length !== W * H * 3) throw new Error(`expected ${W * H * 3} bytes, got ${raw.length}`);

const out = Buffer.alloc(W * H * 4);
const unmatched = new Map();
let landPixels = 0;
for (let p = 0, q = 0; p < raw.length; p += 3, q += 4) {
  const packed = (raw[p] << 16) | (raw[p + 1] << 8) | raw[p + 2];
  const stateId = stateOfColour.get(packed);
  const idx = stateId ? indexOf.get(stateId) ?? 0 : 0;
  if (stateId && !indexOf.has(stateId)) {
    unmatched.set(stateId, (unmatched.get(stateId) ?? 0) + 1);
  }
  out[q] = idx & 255;          // R: low byte of the state index
  out[q + 1] = (idx >> 8) & 255; // G: high byte
  out[q + 2] = 0;
  out[q + 3] = 255;
  if (idx) landPixels++;
}

mkdirSync(new URL('../public/img/map/', import.meta.url).pathname, { recursive: true });
const pngPath = new URL('../public/img/map/states.png', import.meta.url).pathname;
execFileSync('magick', ['-size', `${W}x${H}`, '-depth', '8', 'RGBA:-', pngPath], { input: out });

// ── Layer catalog: what can be mapped ───────────────────────────────
// Every capped resource building that appears in any state, plus arable land,
// plus the undiscovered (prospectable) deposits.
const capNames = new Map();
for (const s of states) for (const r of s.cappedResources) capNames.set(r.id, r.name);

const layers = [
  ...[...capNames.entries()]
    .map(([id, name]) => ({
      key: `cap:${id}`,
      name,
      kind: 'capped',
      unit: 'max levels',
      building: id.replace(/^building_/, ''),
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  { key: 'arable', name: 'Arable land', kind: 'arable', unit: 'max farm/ranch levels' },
];
const discoverGroups = new Map();
for (const s of states) {
  for (const d of s.discoverables) {
    if (d.group && d.amount) discoverGroups.set(d.group, d.name ?? d.group);
  }
}
for (const [group, name] of [...discoverGroups.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
  layers.push({ key: `find:${group}`, name: `${name} (undiscovered)`, kind: 'discoverable', unit: 'hidden levels' });
}

// ── Per-state values, keyed by the same index the image encodes ─────
const values = {};   // layerKey -> { stateIndex: amount }
const put = (key, idx, amount) => {
  if (!amount) return;
  (values[key] ??= {})[idx] = (values[key][idx] ?? 0) + amount;
};
const stateMeta = {};
for (const s of states) {
  const idx = indexOf.get(s.id);
  stateMeta[idx] = { id: s.id, name: s.name, region: s.region?.name ?? null };
  for (const r of s.cappedResources) put(`cap:${r.id}`, idx, r.cap);
  put('arable', idx, s.arableLand);
  for (const d of s.discoverables) if (d.group) put(`find:${d.group}`, idx, d.amount ?? 0);
}

writeFileSync(
  new URL('../public/data/map.json', import.meta.url).pathname,
  stableStringify({ width: W, height: H, layers, values, states: stateMeta }, 0),
);

const covered = Object.keys(stateMeta).length;
console.log(
  `map: ${W}x${H} index image · ${covered} states · ${layers.length} layers · ` +
    `${(landPixels / (W * H) * 100).toFixed(1)}% land pixels` +
    (unmatched.size ? ` · ${unmatched.size} state(s) on the map with no data row` : ''),
);
