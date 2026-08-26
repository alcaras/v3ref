// build_locations.mjs — the 1836 picture of every state region.
//
//   src/data/locations.json  per state: owner(s), homelands, population by
//                            culture and religion, the buildings that exist at
//                            game start with their activated production
//                            methods, and the goods those buildings put out.
//
// Sources (all under game/common/history):
//   states/    create_state → which country owns it, plus add_homeland
//   pops/      create_pop   → culture/religion/size, per owning country
//   buildings/ create_building → building, ownership levels, activated PMs
//
// Goods output is computed, not guessed: for each starting building we read the
// production methods the save actually activates, sum those methods' output and
// input lines, and multiply by the building's level count. That is the game's
// own definition of what the building makes at full staffing — see the caption
// on the page for what it does and does not account for.

import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFile, asArray, idList, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';

const loc = loadLoc();
const root = join(dataRoot(), 'game/common/history');
const gen = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url).pathname, 'utf8'));

// Every file in these folders wraps its content in the SAME top-level key
// (STATES / POPS / BUILDINGS), so parseFolder's merge would keep only the last
// file's block. Parse each file and collect the wrappers separately.
async function parseEach(folder, wrapper) {
  const dir = join(root, folder);
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.txt')) continue;
    const parsed = await parseFile(join(dir, f));
    for (const block of asArray(parsed[wrapper])) if (block) out.push(block);
  }
  return out;
}
const [hStates, hPops, hBuildings] = await Promise.all([
  parseEach('states', 'STATES'),
  parseEach('pops', 'POPS'),
  parseEach('buildings', 'BUILDINGS'),
]);

const { states } = gen('states.json');
const { buildings } = gen('buildings.json');
const { pms } = gen('pms.json');
const { countries } = gen('countries.json');
const { goods } = gen('goods.json');

const buildingById = new Map(buildings.map((b) => [b.id, b]));
const pmById = new Map(pms.map((p) => [p.id, p]));
const goodById = new Map(goods.map((g) => [g.id, g]));
const countryByTag = new Map(countries.map((c) => [c.tag, c]));

// `c:SWE` → SWE, `cu:swedish` → swedish, `s:STATE_X` → STATE_X
const bare = (v) => String(v ?? '').replace(/^[a-z_]+:/, '');

// ── Ownership + homelands ───────────────────────────────────────────
const owners = new Map();     // stateId -> [tags]
const homelands = new Map();  // stateId -> [culture ids]
for (const file of hStates) {
  for (const [key, entry] of Object.entries(file ?? {})) {
    if (!key.startsWith('s:')) continue;
    const stateId = bare(key);
    const tags = asArray(entry.create_state)
      .map((cs) => bare(cs?.country))
      .filter(Boolean);
    if (tags.length) owners.set(stateId, [...new Set(tags)]);
    const homes = idList(entry.add_homeland).map(bare);
    if (homes.length) homelands.set(stateId, [...new Set(homes)]);
  }
}

// ── Pops ────────────────────────────────────────────────────────────
const popsOf = new Map();     // stateId -> [{culture, religion, size, type, owner}]
for (const file of hPops) {
  for (const [key, entry] of Object.entries(file ?? {})) {
    if (!key.startsWith('s:')) continue;
    const stateId = bare(key);
    const list = popsOf.get(stateId) ?? [];
    for (const [rsKey, rs] of Object.entries(entry ?? {})) {
      if (!rsKey.startsWith('region_state:')) continue;
      const tag = bare(rsKey);
      for (const p of asArray(rs?.create_pop)) {
        if (!p?.size) continue;
        list.push({
          owner: tag,
          culture: p.culture ? bare(p.culture) : null,
          religion: p.religion ? bare(p.religion) : null,
          type: p.pop_type ? bare(p.pop_type) : null,
          size: Number(p.size) || 0,
        });
      }
    }
    if (list.length) popsOf.set(stateId, list);
  }
}

// ── Starting buildings ──────────────────────────────────────────────
// Levels live under add_ownership, which can name countries, buildings
// (private investment) or companies — sum them all.
function ownedLevels(entry) {
  let total = 0;
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'levels') total += Number(v) || 0;
      else if (typeof v === 'object') walk(v);
    }
  };
  walk(entry.add_ownership);
  // Some entries state a level count directly instead of via ownership.
  if (!total && entry.level) total = Number(entry.level) || 0;
  return total;
}

const buildingsOf = new Map(); // stateId -> [{id,name,slug,levels,pms:[],owner}]
for (const file of hBuildings) {
  for (const [key, entry] of Object.entries(file ?? {})) {
    if (!key.startsWith('s:')) continue;
    const stateId = bare(key);
    const list = buildingsOf.get(stateId) ?? [];
    for (const [rsKey, rs] of Object.entries(entry ?? {})) {
      if (!rsKey.startsWith('region_state:')) continue;
      const tag = bare(rsKey);
      for (const cb of asArray(rs?.create_building)) {
        const bId = String(cb?.building ?? '').replace(/^"|"$/g, '');
        if (!bId) continue;
        const meta = buildingById.get(bId);
        list.push({
          id: bId,
          slug: bId.replace(/^building_/, ''),
          name: meta?.name ?? loc.name(bId),
          levels: ownedLevels(cb),
          owner: tag,
          pms: idList(cb.activate_production_methods)
            .map((p) => String(p).replace(/^"|"$/g, ''))
            .map((p) => ({ id: p, name: pmById.get(p)?.name ?? loc.name(p) })),
        });
      }
    }
    if (list.length) buildingsOf.set(stateId, list);
  }
}

// ── Goods flow at game start ────────────────────────────────────────
// A building's activated PMs give its per-level goods lines; multiply by the
// levels that exist in 1836.
function goodsFlow(list) {
  const flow = {};   // goodId -> net units
  const outputs = {}; // goodId -> gross output only (what the state "produces")
  for (const b of list) {
    const levels = b.levels || 0;
    if (!levels) continue;
    for (const pmRef of b.pms) {
      const pm = pmById.get(pmRef.id);
      if (!pm) continue;
      for (const l of pm.outputs) {
        flow[l.good] = (flow[l.good] ?? 0) + l.amount * levels;
        outputs[l.good] = (outputs[l.good] ?? 0) + l.amount * levels;
      }
      for (const l of pm.inputs) flow[l.good] = (flow[l.good] ?? 0) - l.amount * levels;
    }
  }
  return { flow, outputs };
}

// ── Assemble ────────────────────────────────────────────────────────
const locations = states.map((s) => {
  const pops = popsOf.get(s.id) ?? [];
  const bList = (buildingsOf.get(s.id) ?? []).sort(
    (a, b) => b.levels - a.levels || a.name.localeCompare(b.name),
  );
  const { flow, outputs } = goodsFlow(bList);

  const byCulture = new Map();
  const byReligion = new Map();
  // 218 of 675 states are split between two or more countries, and the setup
  // records every pop under the country that holds it — so a state's people
  // belong to specific owners, not to the state as a whole.
  const byOwner = new Map();
  let population = 0;
  for (const p of pops) {
    population += p.size;
    if (p.culture) byCulture.set(p.culture, (byCulture.get(p.culture) ?? 0) + p.size);
    if (p.religion) byReligion.set(p.religion, (byReligion.get(p.religion) ?? 0) + p.size);
    if (p.owner) byOwner.set(p.owner, (byOwner.get(p.owner) ?? 0) + p.size);
  }
  const share = (m) =>
    [...m.entries()]
      .map(([id, size]) => ({ id, name: loc.name(id), size, pct: population ? size / population : 0 }))
      .sort((a, b) => b.size - a.size);

  const named = (bag, sign = 1) =>
    Object.entries(bag)
      .filter(([, n]) => n !== 0)
      .map(([id, n]) => ({ id, name: goodById.get(id)?.name ?? loc.name(id), amount: n * sign }))
      .sort((a, b) => b.amount - a.amount);

  return {
    id: s.id,
    slug: s.id.replace(/^STATE_/, '').toLowerCase(),
    name: s.name,
    region: s.region,
    owners: (owners.get(s.id) ?? [])
      .map((tag) => ({
        tag,
        name: countryByTag.get(tag)?.name ?? tag,
        population: byOwner.get(tag) ?? 0,
      }))
      .sort((a, b) => b.population - a.population),
    split: (owners.get(s.id) ?? []).length > 1,
    homelands: (homelands.get(s.id) ?? []).map((id) => ({ id, name: loc.name(id) })),
    population,
    cultures: share(byCulture),
    religions: share(byReligion),
    arableLand: s.arableLand,
    arableResources: s.arableResources,
    cappedResources: s.cappedResources,
    discoverables: s.discoverables,
    traits: s.traits,
    navalExit: s.navalExit,
    buildings: bList,
    buildingLevels: bList.reduce((t, b) => t + (b.levels || 0), 0),
    produces: named(outputs),
    netGoods: named(flow),
  };
});

locations.sort((a, b) => b.population - a.population || a.name.localeCompare(b.name));

writeFileSync(
  new URL('../src/data/locations.json', import.meta.url).pathname,
  stableStringify({ locations }),
);

const withPops = locations.filter((l) => l.population > 0).length;
const withBuildings = locations.filter((l) => l.buildings.length).length;
console.log(
  `locations.json: ${locations.length} states · ${withPops} populated · ${withBuildings} with 1836 buildings · ` +
    `${locations.reduce((t, l) => t + l.population, 0).toLocaleString()} people`,
);
