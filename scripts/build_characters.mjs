// build_characters.mjs — emits:
//   src/data/character_traits.json  personality/skill/condition traits with
//                                   character + country + command modifiers
//   src/data/decrees.json           decrees: cost, gates, state modifiers

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, asArray, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
import { iconPath } from './lib/icons.mjs';
import { loadModifiers } from './lib/modifiers.mjs';

const loc = loadLoc();
const mods = await loadModifiers(loc);
const root = join(dataRoot(), 'game/common');

const [traits, decrees] = await Promise.all([
  parseFolder(join(root, 'character_traits')),
  parseFolder(join(root, 'decrees')),
]);

const bag = (m) => mods.formatBag(Object.assign({}, ...asArray(m)));
const TYPE_ORDER = ['personality', 'skill', 'condition'];

const traitList = Object.entries(traits.entries)
  .map(([id, t]) => ({
    id,
    name: loc.name(id),
    icon: iconPath(t.texture, 'traits'),
    type: t.type ?? null,
    // The three modifier scopes a trait can carry; command applies when leading
    // a formation.
    character: bag(t.character_modifier),
    country: bag(t.country_modifier),
    command: bag(t.command_modifier ?? t.commander_modifier),
    replaces: asArray(t.replace).flat(),
  }))
  .sort(
    (a, b) =>
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name),
  );
writeFileSync(
  new URL('../src/data/character_traits.json', import.meta.url).pathname,
  stableStringify({ traits: traitList }),
);

const decreeList = Object.entries(decrees.entries)
  .map(([id, d]) => ({
    id,
    name: loc.name(id),
    icon: iconPath(d.texture, 'decrees'),
    cost: d.cost ?? null,
    techs: asArray(d.unlocking_technologies).flat().map((t) => ({ id: t, name: loc.name(t) })),
    laws: asArray(d.unlocking_laws).flat().map((l) => ({ id: l, name: loc.name(l) })),
    modifiers: bag(d.modifier),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(
  new URL('../src/data/decrees.json', import.meta.url).pathname,
  stableStringify({ decrees: decreeList }),
);

console.log(`character_traits.json: ${traitList.length} traits · decrees.json: ${decreeList.length} decrees`);
