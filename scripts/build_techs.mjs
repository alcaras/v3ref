// build_techs.mjs — emits src/data/techs.json: every technology with era,
// category, prerequisites, its own modifiers, and a reverse index of what it
// unlocks (buildings, PMs, laws, decrees) built by scanning those datasets'
// unlocking_technologies — the graph queried backwards.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, asArray, stableStringify , idList } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
import { iconPath } from './lib/icons.mjs';
import { loadModifiers } from './lib/modifiers.mjs';
import { loadEconomy } from './lib/economy.mjs';

const loc = loadLoc();
const mods = await loadModifiers(loc);
const econ = await loadEconomy();
const root = join(dataRoot(), 'game/common');

const [techs, eras, laws, decrees] = await Promise.all([
  parseFolder(join(root, 'technology/technologies')),
  parseFolder(join(root, 'technology/eras')),
  parseFolder(join(root, 'laws')),
  parseFolder(join(root, 'decrees')),
]);

// Reverse unlock index: tech -> {buildings, pms, laws, decrees}
const unlocks = {};
const addUnlock = (techIds, kind, ref) => {
  for (const t of idList(techIds)) {
    ((unlocks[t] ??= {})[kind] ??= []).push(ref);
  }
};
for (const [id, b] of Object.entries(econ.buildings)) {
  if (b.building_group === 'bg_monuments_hidden') continue;
  addUnlock(b.unlocking_technologies, 'buildings', {
    id, slug: id.replace(/^building_/, ''), name: loc.name(id),
  });
}
for (const [id, pm] of Object.entries(econ.pms)) {
  if (!econ.pmSites.get(id)?.length) continue;
  addUnlock(pm.unlocking_technologies, 'pms', { id, name: loc.name(id) });
}
for (const [id, l] of Object.entries(laws.entries)) {
  addUnlock(l.unlocking_technologies, 'laws', { id, name: loc.name(id) });
}
for (const [id, d] of Object.entries(decrees.entries)) {
  addUnlock(d.unlocking_technologies, 'decrees', { id, name: loc.name(id) });
}

const eraNum = (era) => Number(String(era ?? '').replace('era_', '')) || 0;
const CATEGORY_ORDER = ['production', 'military', 'society'];

const techList = Object.entries(techs.entries)
  .map(([id, t]) => ({
    id,
    name: loc.name(id),
    icon: iconPath(t.texture, 'techs'),
    era: eraNum(t.era),
    eraCost: eras.entries[t.era]?.technology_cost ?? null,
    category: t.category ? { id: t.category, name: loc.name(t.category) } : null,
    canResearch: !(t.can_research === false || t.can_research === 'no'),
    prereqs: idList(t.unlocking_technologies).map((p) => ({ id: p, name: loc.name(p) })),
    modifiers: mods.formatBag(Object.assign({}, ...asArray(t.modifier))),
    unlocks: {
      buildings: (unlocks[id]?.buildings ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      pms: (unlocks[id]?.pms ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      laws: (unlocks[id]?.laws ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      decrees: (unlocks[id]?.decrees ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    },
  }))
  .sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.era - b.era ||
      a.name.localeCompare(b.name),
  );

writeFileSync(new URL('../src/data/techs.json', import.meta.url).pathname, stableStringify({ techs: techList }));
console.log(`techs.json: ${techList.length} technologies (bonus-only: ${techList.filter((t) => !t.canResearch).length})`);
