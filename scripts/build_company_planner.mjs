// build_company_planner.mjs — emits public/data/company-planner.json for the
// Company Planner tool: the slim company list (buildings, extensions,
// prestige goods, prosperity bonus) plus every source of a company slot
// (country_max_companies_add) so the planner can explain the slot count.
//
// Supersedes the standalone v3co company builder — same idea, live data.

import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, asArray, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';

const loc = loadLoc();
const root = join(dataRoot(), 'game/common');
const gen = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url).pathname, 'utf8'));

const { companies } = gen('companies.json');
const { buildings } = gen('buildings.json');
const buildingMeta = Object.fromEntries(
  buildings.map((b) => [b.id, { name: b.name, icon: b.icon, group: b.groupRoot?.name ?? null }]),
);

// Every place a company slot comes from. The value is always +1 today, but
// read it rather than assume.
const SLOT_KEY = 'country_max_companies_add';
const [laws, techs, principles] = await Promise.all([
  parseFolder(join(root, 'laws')),
  parseFolder(join(root, 'technology/technologies')),
  parseFolder(join(root, 'power_bloc_principles')),
]);
const slotSources = [];
// Principles carry their effects in member_/leader_ scopes, not `modifier`.
const MOD_SCOPES = ['modifier', 'member_modifier', 'leader_modifier', 'power_bloc_modifier'];
const scan = (entries, kind, page) => {
  for (const [id, entry] of Object.entries(entries)) {
    const bag = Object.assign({}, ...MOD_SCOPES.flatMap((s) => asArray(entry[s])));
    if (bag[SLOT_KEY]) {
      slotSources.push({ id, name: loc.name(id), kind, page, slots: Number(bag[SLOT_KEY]) });
    }
  }
};
scan(laws.entries, 'law', 'laws');
scan(techs.entries, 'technology', 'technology');
scan(principles.entries, 'principle', 'power-blocs');
slotSources.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

const out = {
  companies: companies.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    flavored: c.flavored,
    buildings: c.buildings.map((b) => b.id),
    extensions: c.extensionBuildings.map((b) => b.id),
    prestige: c.prestigeGoods.map((p) => p.name),
    hq: c.preferredHq.map((s) => s.name),
    prosperity: c.prosperity.map((m) => ({ t: m.valueText, l: m.label, tone: m.tone })),
  })),
  buildings: buildingMeta,
  slotSources,
};

writeFileSync(
  new URL('../public/data/company-planner.json', import.meta.url).pathname,
  stableStringify(out, 0),
);
console.log(
  `company-planner.json: ${out.companies.length} companies · ${slotSources.length} slot sources`,
);
