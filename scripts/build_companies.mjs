// build_companies.mjs — emits src/data/companies.json: every company type with
// its buildings, charter-extension buildings, prestige goods, prosperity
// bonus, and preferred headquarters. Formation conditions are scripted
// triggers — we surface the preferred HQ states as the location hint.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, asArray, stableStringify , idList } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
import { iconPath } from './lib/icons.mjs';
import { loadModifiers } from './lib/modifiers.mjs';

const loc = loadLoc();
const mods = await loadModifiers(loc);
const root = join(dataRoot(), 'game/common');
const { entries: companies } = await parseFolder(join(root, 'company_types'));

const bag = (m) => mods.formatBag(Object.assign({}, ...asArray(m)));
const buildingRefs = (ids) =>
  idList(ids).map((b) => ({ id: b, slug: b.replace(/^building_/, ''), name: loc.name(b) }));

const list = Object.entries(companies.entries ?? companies).map(([id, c]) => ({
  id,
  name: loc.name(id),
  icon: iconPath(c.icon, 'companies'),
  flavored: c.flavored_company === true || c.flavored_company === 'yes',
  category: c.category ? { id: c.category, name: loc.name(c.category, ['company_category_']) } : null,
  buildings: buildingRefs(c.building_types),
  extensionBuildings: buildingRefs(c.extension_building_types),
  prestigeGoods: idList(c.possible_prestige_goods).map((p) => ({ id: p, name: loc.name(p) })),
  preferredHq: idList(c.preferred_headquarters).map((s) => ({ id: s, name: loc.name(s) })),
  prosperity: bag(c.prosperity_modifier),
}));

list.sort(
  (a, b) => Number(b.flavored) - Number(a.flavored) || a.name.localeCompare(b.name),
);

writeFileSync(
  new URL('../src/data/companies.json', import.meta.url).pathname,
  stableStringify({ companies: list }),
);
console.log(
  `companies.json: ${list.length} companies (${list.filter((c) => c.flavored).length} flavored)`,
);
