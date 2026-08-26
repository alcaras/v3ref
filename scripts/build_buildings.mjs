// build_buildings.mjs — emits:
//   src/data/buildings.json  building catalog + full PM-group/PM matrix
//   src/data/pms.json        flat production-method list for the PM explorer
//
// Per PM we resolve goods lines (per-level at full employment), employment,
// requirement gates (techs/laws/principles/…), and a base-price net:
//   net = Σ outputs×basePrice − Σ inputs×basePrice   ('add' lines only —
// percentage (_mult) lines can't be priced without a concrete building state).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, parseFile, asArray, stableStringify , idList } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
import { iconPath } from './lib/icons.mjs';
import { loadEconomy } from './lib/economy.mjs';

const loc = loadLoc();
const econ = await loadEconomy();
const root = join(dataRoot(), 'game/common');

const { entries: goodsRaw } = await parseFolder(join(root, 'goods'));
const goodCost = Object.fromEntries(Object.entries(goodsRaw).map(([id, g]) => [id, g.cost ?? 0]));

// construction_cost_* values (script_values/building_values.txt).
const buildingValues = await parseFile(join(root, 'script_values/building_values.txt'));

// Building-group chain helpers: root group + inherited land_usage.
function groupChain(groupId) {
  const chain = [];
  let cur = groupId;
  while (cur && econ.buildingGroups[cur] && !chain.includes(cur)) {
    chain.push(cur);
    cur = econ.buildingGroups[cur].parent_group;
  }
  return chain; // [leaf, …, root]
}
function landUsage(groupId) {
  for (const g of groupChain(groupId)) {
    const lu = econ.buildingGroups[g]?.land_usage;
    if (lu) return lu;
  }
  // Docs in building_groups: "Default no state resource usage. If unspecified,
  // will return first non-default land usage type found in parent building
  // group tree." So nothing in the tree means the building consumes neither
  // Urbanization nor Arable Land. `category` is a DIFFERENT field (its values
  // include `development`) and must not be substituted here.
  return null;
}

const names = (ids) => idList(ids).map((id) => ({ id, name: loc.name(id) }));

function pmView(pmId) {
  const pm = econ.pms[pmId] ?? {};
  const lines = econ.pmGoods.get(pmId) ?? [];
  const jobs = (econ.pmEmployment.get(pmId) ?? []).map((j) => ({
    popType: j.popType,
    name: loc.name(j.popType),
    amount: j.amount,
  }));
  const side = (dir) =>
    lines
      .filter((l) => l.dir === dir)
      .map((l) => ({ good: l.good, name: loc.name(l.good), amount: l.amount, kind: l.kind }))
      .sort((a, b) => b.amount - a.amount);
  const inputs = side('input');
  const outputs = side('output');
  const price = (list) =>
    list.filter((l) => l.kind === 'add').reduce((s, l) => s + l.amount * (goodCost[l.good] ?? 0), 0);
  const other = [
    ...names(pm.unlocking_principles),
    ...names(pm.unlocking_identity),
    ...names(pm.unlocking_company_categories),
    ...names(pm.unlocking_geographic_regions),
    ...names(pm.unlocking_religions),
    ...names(pm.unlocking_production_methods),
  ];
  return {
    id: pmId,
    name: loc.name(pmId),
    icon: iconPath(pm.texture, 'pms'),
    techs: names(pm.unlocking_technologies),
    laws: names(pm.unlocking_laws),
    blockedByLaws: names(pm.disallowing_laws),
    other,
    inputs,
    outputs,
    jobs,
    totalJobs: jobs.reduce((s, j) => s + j.amount, 0),
    netAtBase: Math.round(price(outputs) - price(inputs)),
  };
}

// bg_monuments_hidden holds decorative-only dummies (Machu Picchu etc.) whose
// loc name is literally a dev note ("…is a dummy building…"). Not gameplay.
const isHidden = (b) => groupChain(b.building_group).includes('bg_monuments_hidden');

const buildings = Object.entries(econ.buildings)
  .filter(([, b]) => !isHidden(b))
  .map(([id, b]) => {
  const chain = groupChain(b.building_group);
  const groupRoot = chain[chain.length - 1] ?? null;
  const construction = b.required_construction
    ? { key: b.required_construction, value: buildingValues[b.required_construction] ?? null }
    : null;
  const pmGroups = asArray(b.production_method_groups)
    .flat()
    .map((pmgId) => ({
      id: pmgId,
      name: loc.name(pmgId),
      pms: idList(econ.pmgs[pmgId]?.production_methods).map(pmView),
    }));
  const outputGoods = [
    ...new Set(pmGroups.flatMap((g) => g.pms.flatMap((pm) => pm.outputs.map((o) => o.good)))),
  ];
  return {
    id,
    slug: id.replace(/^building_/, ''),
    name: loc.name(id),
    icon: iconPath(b.icon, 'buildings'),
    group: b.building_group ? { id: b.building_group, name: loc.name(b.building_group) } : null,
    groupRoot: groupRoot ? { id: groupRoot, name: loc.name(groupRoot) } : null,
    landUsage: landUsage(b.building_group),
    construction,
    unique: b.unique === true || b.unique === 'yes',
    port: b.port === true || b.port === 'yes',
    techs: names(b.unlocking_technologies),
    pmGroups,
    outputGoods,
  };
});

writeFileSync(
  new URL('../src/data/buildings.json', import.meta.url).pathname,
  stableStringify({ buildings }),
);

// Flat PM list (one row per PM × building site).
const pms = [...new Set([...econ.pmSites.keys(), ...Object.keys(econ.pms)])]
  .filter((pmId) => econ.pmSites.get(pmId)?.length) // skip PMs no building offers
  .map((pmId) => {
    const view = pmView(pmId);
    const sites = econ.pmSites.get(pmId) ?? [];
    return {
      ...view,
      buildings: [...new Set(sites.map((s) => s.building))].map((bId) => ({
        id: bId,
        slug: bId.replace(/^building_/, ''),
        name: loc.name(bId),
      })),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

writeFileSync(new URL('../src/data/pms.json', import.meta.url).pathname, stableStringify({ pms }));

console.log(`buildings.json: ${buildings.length} buildings · pms.json: ${pms.length} PMs`);
