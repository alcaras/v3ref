// build_diplomacy2.mjs — emits:
//   src/data/subjects.json  subject types: autonomy, category, behavior flags
//   src/data/plays.json     diplomatic plays (→ war goal) + war goal catalog

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, asArray, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';

const loc = loadLoc();
const root = join(dataRoot(), 'game/common');

const [subjectTypes, plays, warGoals] = await Promise.all([
  parseFolder(join(root, 'subject_types')),
  parseFolder(join(root, 'diplomatic_plays')),
  parseFolder(join(root, 'war_goal_types')),
]);

const yes = (v) => v === true || v === 'yes';

const subjects = Object.entries(subjectTypes.entries).map(([id, s]) => ({
  id,
  name: loc.name(id),
  autonomyLevel: s.autonomy_level ?? null,
  category: s.category ?? null,
  joinOverlordWars: yes(s.join_overlord_wars),
  canStartPlays: yes(s.can_start_own_diplomatic_plays),
  canHaveSubjects: yes(s.can_have_subjects),
  annexOnFormation: yes(s.annex_on_country_formation),
  overlordMapColor: yes(s.use_overlord_map_color),
  givesPrestige: yes(s.gives_prestige_to_overlord),
  breaksIfNotProtected: yes(s.breaks_if_subject_not_protected),
  diplomaticAction: s.diplomatic_action ?? null,
}));
subjects.sort((a, b) => (a.autonomyLevel ?? 99) - (b.autonomyLevel ?? 99) || a.name.localeCompare(b.name));
writeFileSync(
  new URL('../src/data/subjects.json', import.meta.url).pathname,
  stableStringify({ subjects }),
);

const goalList = Object.entries(warGoals.entries).map(([id, g]) => ({
  id,
  name: loc.name(id),
  icon: `img/wargoals/${String(g.icon ?? '').split('/').pop()?.replace(/\.dds$/, '')}.png`,
  kind: g.kind ?? null,
  settings: asArray(g.settings).flat().filter((s) => typeof s === 'string'),
  plays: [],
}));
const goalById = Object.fromEntries(goalList.map((g) => [g.id, g]));

const playList = Object.entries(plays.entries).map(([id, p]) => {
  goalById[p.war_goal]?.plays.push(id);
  return {
    id,
    name: loc.name(id),
    icon: `img/wargoals/${String(p.texture ?? '').split('/').pop()?.replace(/\.dds$/, '')}.png`,
    warGoal: p.war_goal ? { id: p.war_goal, name: loc.name(p.war_goal) } : null,
    warOnly: yes(p.war_only),
    requiresInterest: yes(p.requires_interest_marker),
  };
});
playList.sort((a, b) => a.name.localeCompare(b.name));
goalList.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(
  new URL('../src/data/plays.json', import.meta.url).pathname,
  stableStringify({ plays: playList, warGoals: goalList }),
);

console.log(
  `subjects.json: ${subjects.length} subject types · plays.json: ${playList.length} plays, ${goalList.length} war goals`,
);
