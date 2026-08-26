// build_ships.mjs — emits src/data/ships.json: ship types (headline stats
// pulled into columns, the rest kept as a modifier list) and ship
// modifications with their gates.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, asArray, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
import { loadModifiers } from './lib/modifiers.mjs';

const loc = loadLoc();
const mods = await loadModifiers(loc);
const root = join(dataRoot(), 'game/common');

const [shipTypes, shipGroups, shipMods] = await Promise.all([
  parseFolder(join(root, 'ship_types')),
  parseFolder(join(root, 'ship_groups')),
  parseFolder(join(root, 'ship_modifications')),
]);

const names = (ids) => asArray(ids).flat().map((id) => ({ id, name: loc.name(id) }));

// Headline stats shown as table columns; everything else stays a mod list.
const HEADLINE = {
  hp: 'ship_hit_points_max_add',
  crew: 'ship_crew_max_add',
  speed: 'ship_movement_speed_add',
  armor: 'ship_armor_add',
  hullDamage: 'ship_hull_damage_add',
  crewDamage: 'ship_crew_damage_add',
  supply: 'ship_supply_capacity_add',
};

// A tech mentioned in is_obsolete is a plain trigger — pull the tech ids out.
const techsIn = (trigger) => {
  const out = [];
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    for (const [k, val] of Object.entries(v)) {
      if (k === 'has_technology_researched') out.push(...asArray(val).flat());
      else if (typeof val === 'object') walk(val);
    }
  };
  walk(trigger);
  return out.map((id) => ({ id, name: loc.name(id) }));
};

const types = Object.entries(shipTypes.entries).map(([id, s], index) => {
  const bag = Object.assign({}, ...asArray(s.modifier));
  const headline = {};
  for (const [col, key] of Object.entries(HEADLINE)) {
    headline[col] = bag[key] ?? null;
    delete bag[key];
  }
  return {
    id,
    name: loc.name(id),
    group: s.ship_group ? { id: s.ship_group, name: loc.name(s.ship_group) } : null,
    flagship: s.can_be_flagship === true || s.can_be_flagship === 'yes',
    modificationCost: s.modification_construction_cost ?? null,
    techs: names(s.unlocking_technologies),
    obsoleteAt: techsIn(s.is_obsolete),
    ...headline,
    other: mods.formatBag(bag),
    fileOrder: index,
  };
});
types.sort(
  (a, b) => (a.group?.id ?? '').localeCompare(b.group?.id ?? '') || a.fileOrder - b.fileOrder,
);

const modifications = Object.entries(shipMods.entries).map(([id, m]) => ({
  id,
  name: loc.name(id),
  slot: m.type ? { id: m.type, name: loc.name(m.type) } : null,
  techs: names(m.unlocking_technologies),
  modifiers: mods.formatBag(Object.assign({}, ...asArray(m.modifier))),
}));
modifications.sort(
  (a, b) => (a.slot?.name ?? '').localeCompare(b.slot?.name ?? '') || a.id.localeCompare(b.id),
);

writeFileSync(
  new URL('../src/data/ships.json', import.meta.url).pathname,
  stableStringify({ shipTypes: types, modifications }),
);
console.log(`ships.json: ${types.length} ship types, ${modifications.length} modifications`);
