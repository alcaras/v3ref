// build_military.mjs — emits:
//   src/data/units.json         combat unit types: group, army/navy, manpower,
//                               battle + upkeep modifiers, unlock tech
//   src/data/mobilization.json  mobilization options: goods upkeep, unit
//                               effects, gates

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, asArray, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
import { loadModifiers } from './lib/modifiers.mjs';

const loc = loadLoc();
const mods = await loadModifiers(loc);
const root = join(dataRoot(), 'game/common');

const [unitTypes, unitGroups, mobOptions] = await Promise.all([
  parseFolder(join(root, 'combat_unit_types')),
  parseFolder(join(root, 'combat_unit_groups')),
  parseFolder(join(root, 'mobilization_options')),
]);

const bag = (m) => mods.formatBag(Object.assign({}, ...asArray(m)));
const names = (ids) => asArray(ids).flat().map((id) => ({ id, name: loc.name(id) }));

// group -> domain: unit groups declare a type (army/navy).
const domainOf = {};
for (const [gId, g] of Object.entries(unitGroups.entries)) domainOf[gId] = g.type ?? null;

const units = Object.entries(unitTypes.entries).map(([id, u], index) => ({
  id,
  name: loc.name(id),
  icon: `img/military/${id.replace('combat_unit_type_', '')}.png`,
  group: u.group ? { id: u.group, name: loc.name(u.group) } : null,
  domain: domainOf[u.group] ?? (unitTypes.sources[id]?.includes('land') ? 'army' : 'navy'),
  manpower: u.max_manpower ?? null,
  supplyCapacity: u.supply_capacity ?? null,
  conscriptLevies: u.conscript_peasant_levies === true || u.conscript_peasant_levies === 'yes',
  techs: names(u.unlocking_technologies),
  battle: bag(u.battle_modifier),
  upkeep: bag(u.upkeep_modifier),
  fileOrder: index, // in-file order = tier order (the game picks the last buildable)
}));
units.sort(
  (a, b) =>
    (a.domain ?? '').localeCompare(b.domain ?? '') ||
    (a.group?.id ?? '').localeCompare(b.group?.id ?? '') ||
    a.fileOrder - b.fileOrder,
);
writeFileSync(new URL('../src/data/units.json', import.meta.url).pathname, stableStringify({ units }));

const mobilization = Object.entries(mobOptions.entries).map(([id, m]) => ({
  id,
  name: loc.name(id),
  icon: `img/mobilization/${String(m.texture ?? '').split('/').pop()?.replace(/\.dds$/, '')}.png`,
  group: m.group ?? null,
  techs: names(m.unlocking_technologies),
  // Per-unit goods upkeep while mobilized + flat (unscaled) modifiers.
  upkeep: bag(m.upkeep_modifier),
  upkeepUnscaled: bag(m.upkeep_modifier_unscaled),
  unitEffects: bag(m.unit_modifier),
}));
mobilization.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.id.localeCompare(b.id));
writeFileSync(
  new URL('../src/data/mobilization.json', import.meta.url).pathname,
  stableStringify({ mobilization }),
);

console.log(`units.json: ${units.length} unit types · mobilization.json: ${mobilization.length} options`);
