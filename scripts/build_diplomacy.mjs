// build_diplomacy.mjs — emits:
//   src/data/treaties.json     every treaty article: kind, cost, flags, gates,
//                              exclusions, modifiers
//   src/data/power_blocs.json  identities + principle groups with their
//                              tier-1..3 principles and modifiers

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, asArray, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
import { iconPath } from './lib/icons.mjs';
import { loadModifiers } from './lib/modifiers.mjs';

const loc = loadLoc();
const mods = await loadModifiers(loc);
const root = join(dataRoot(), 'game/common');

const [articles, identities, principleGroups, principles] = await Promise.all([
  parseFolder(join(root, 'treaty_articles')),
  parseFolder(join(root, 'power_bloc_identities')),
  parseFolder(join(root, 'power_bloc_principle_groups')),
  parseFolder(join(root, 'power_bloc_principles')),
]);

const bag = (m) => mods.formatBag(Object.assign({}, ...asArray(m)));
const names = (ids) => asArray(ids).flat().map((id) => ({ id, name: loc.name(id) }));

// ── Treaty articles ─────────────────────────────────────────────────
const treatyList = Object.entries(articles.entries)
  .map(([id, a]) => ({
    id,
    name: loc.name(id),
    icon: iconPath(a.icon, 'treaties'),
    kind: a.kind ?? null,
    cost: a.cost ?? null,
    usageLimit: a.usage_limit ?? null,
    flags: asArray(a.flags).flat(),
    exclusions: names(a.mutual_exclusions),
    techs: names(a.unlocked_by_technologies),
    // The three modifier scopes an article can carry.
    mutual: bag(a.mutual_modifier),
    source: bag(a.source_modifier),
    target: bag(a.target_modifier),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(
  new URL('../src/data/treaties.json', import.meta.url).pathname,
  stableStringify({ treaties: treatyList }),
);

// ── Power blocs ─────────────────────────────────────────────────────
const identityList = Object.entries(identities.entries).map(([id, ident]) => ({
  id,
  name: loc.name(id),
  icon: iconPath(ident.icon, 'identities'),
  blocModifiers: bag(ident.power_bloc_modifier),
  leaderModifiers: bag(ident.leader_modifier),
  memberModifiers: bag(ident.member_modifier),
  primaryPrincipleGroup: ident.primary_principle_group
    ? { id: ident.primary_principle_group, name: loc.name(ident.primary_principle_group) }
    : null,
}));

const groupList = Object.entries(principleGroups.entries).map(([gId, g]) => ({
  id: gId,
  name: loc.name(gId),
  primaryFor: g.primary_for_identity
    ? { id: g.primary_for_identity, name: loc.name(g.primary_for_identity) }
    : null,
  principles: asArray(g.levels)
    .flat()
    .filter((p) => typeof p === 'string')
    .map((pId) => {
      const p = principles.entries[pId] ?? {};
      const tierMatch = /_(\d)$/.exec(pId);
      return {
        id: pId,
        name: loc.name(pId),
        tier: tierMatch ? Number(tierMatch[1]) : null,
        icon: iconPath(p.icon, 'principles'),
        blocModifiers: bag(p.power_bloc_modifier),
        leaderModifiers: bag(p.leader_modifier),
        memberModifiers: bag(p.member_modifier),
        institution: p.institution ? { id: p.institution, name: loc.name(p.institution) } : null,
      };
    })
    .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0)),
}));

writeFileSync(
  new URL('../src/data/power_blocs.json', import.meta.url).pathname,
  stableStringify({ identities: identityList, principleGroups: groupList.filter((g) => g.principles.length) }),
);

console.log(
  `treaties.json: ${treatyList.length} articles · power_blocs.json: ${identityList.length} identities, ` +
    `${groupList.filter((g) => g.principles.length).length} principle groups`,
);
