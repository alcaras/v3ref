// build_politics.mjs — emits the politics datasets:
//   src/data/laws.json             law groups (by category) → laws with
//                                  effects, gates, institution, ideology stances
//   src/data/interest_groups.json  the IGs: ideologies + traits w/ thresholds
//   src/data/ideologies.json       every ideology with its law stances
//   src/data/institutions.json     per-level modifiers + funding laws
//
// Effects everywhere go through modifiers.formatBag — never hand-formatted.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, asArray, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
import { loadModifiers } from './lib/modifiers.mjs';

const loc = loadLoc();
const mods = await loadModifiers(loc);
const root = join(dataRoot(), 'game/common');

const [laws, lawGroups, ideologies, igs, igTraits, institutions] = await Promise.all([
  parseFolder(join(root, 'laws')),
  parseFolder(join(root, 'law_groups')),
  parseFolder(join(root, 'ideologies')),
  parseFolder(join(root, 'interest_groups')),
  parseFolder(join(root, 'interest_group_traits')),
  parseFolder(join(root, 'institutions')),
]);

const names = (ids) => asArray(ids).flat().map((id) => ({ id, name: loc.name(id) }));
const iconOf = (entry, dir) =>
  `img/${dir}/${String(entry.icon ?? entry.texture ?? '').split('/').pop()?.replace(/\.dds$/, '')}.png`;
const bag = (m) => mods.formatBag(Object.assign({}, ...asArray(m)));

// ── Ideologies: law stances, flattened lawId -> stance ──────────────
const STANCES = ['strongly_disapprove', 'disapprove', 'neutral', 'approve', 'strongly_approve'];
// Core = ideologies the eight base interest groups actually reference
// (leader + possible character ideologies). Country-flavored, event, and
// movement variants (multiple "Carlist"s) stay in the data but out of the
// matrix displays, which they would swamp.
const coreIds = new Set(
  Object.values(igs.entries).flatMap((ig) => [
    ...asArray(ig.ideologies).flat(),
    ...asArray(ig.character_ideologies).flat(),
  ]),
);

const ideologyList = Object.entries(ideologies.entries).map(([id, ideo]) => {
  const stances = {};
  for (const [k, v] of Object.entries(ideo)) {
    if (!k.startsWith('lawgroup_') || typeof v !== 'object') continue;
    for (const [lawId, stance] of Object.entries(v ?? {})) {
      if (STANCES.includes(stance)) stances[lawId] = stance;
    }
  }
  return {
    id,
    name: loc.name(id),
    icon: iconOf(ideo, 'ideologies'),
    isCharacterIdeology: ideo.character_ideology === true || ideo.character_ideology === 'yes',
    core: coreIds.has(id),
    priority: ideo.priority ?? null,
    stances,
  };
});
writeFileSync(
  new URL('../src/data/ideologies.json', import.meta.url).pathname,
  stableStringify({ ideologies: ideologyList }),
);

// ── Interest groups (file order = in-game order) ────────────────────
const igList = Object.entries(igs.entries).map(([id, ig]) => ({
  id,
  name: loc.name(id),
  icon: iconOf(ig, 'igs'),
  ideologies: names(ig.ideologies),
  characterIdeologies: names(ig.character_ideologies),
  traits: asArray(ig.traits).flat().map((tId) => {
    const t = igTraits.entries[tId] ?? {};
    return {
      id: tId,
      name: loc.name(tId),
      minApproval: t.min_approval ?? null,
      maxApproval: t.max_approval ?? null,
      modifiers: bag(t.modifier),
    };
  }),
}));
writeFileSync(
  new URL('../src/data/interest_groups.json', import.meta.url).pathname,
  stableStringify({ interestGroups: igList }),
);

// ── Laws, grouped ───────────────────────────────────────────────────
// Reverse ideology stances onto each law.
const stancesByLaw = {};
for (const ideo of ideologyList) {
  for (const [lawId, stance] of Object.entries(ideo.stances)) {
    (stancesByLaw[lawId] ??= []).push({ ideology: ideo.id, name: ideo.name, stance });
  }
}

const CATEGORY_ORDER = ['power_structure', 'economy', 'human_rights'];
const groupIds = Object.keys(lawGroups.entries).sort(
  (a, b) =>
    CATEGORY_ORDER.indexOf(lawGroups.entries[a].law_group_category) -
      CATEGORY_ORDER.indexOf(lawGroups.entries[b].law_group_category) ||
    a.localeCompare(b),
);

const lawGroupList = groupIds.map((gId) => {
  const g = lawGroups.entries[gId];
  const groupLaws = Object.entries(laws.entries)
    .filter(([, l]) => l.group === gId)
    .map(([id, l]) => ({
      id,
      name: loc.name(id),
      icon: iconOf(l, 'laws'),
      progressiveness: l.progressiveness ?? 0,
      techs: names(l.unlocking_technologies),
      requiredLaws: names(l.unlocking_laws),
      disallowedLaws: names(l.disallowing_laws),
      institution: l.institution ? { id: l.institution, name: loc.name(l.institution) } : null,
      modifiers: bag(l.modifier),
      stances: (stancesByLaw[id] ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.progressiveness - b.progressiveness || a.id.localeCompare(b.id));
  return {
    id: gId,
    name: loc.name(gId),
    category: g.law_group_category ?? null,
    enactmentDays: g.base_enactment_days ?? null,
    laws: groupLaws,
  };
});
writeFileSync(
  new URL('../src/data/laws.json', import.meta.url).pathname,
  stableStringify({ lawGroups: lawGroupList }),
);

// ── Institutions, with the laws that fund them ──────────────────────
const institutionList = Object.entries(institutions.entries).map(([id, inst]) => ({
  id,
  name: loc.name(id),
  icon: iconOf(inst, 'institutions'),
  modifiers: bag(inst.modifier),
  laws: Object.entries(laws.entries)
    .filter(([, l]) => l.institution === id)
    .map(([lId]) => ({ id: lId, name: loc.name(lId) })),
}));
writeFileSync(
  new URL('../src/data/institutions.json', import.meta.url).pathname,
  stableStringify({ institutions: institutionList }),
);

const lawCount = lawGroupList.reduce((s, g) => s + g.laws.length, 0);
console.log(
  `laws.json: ${lawGroupList.length} groups / ${lawCount} laws · ` +
    `ideologies.json: ${ideologyList.length} · interest_groups.json: ${igList.length} · ` +
    `institutions.json: ${institutionList.length}`,
);
