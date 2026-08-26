// build_entities.mjs — the entity registry + site search index.
// Entities are the nodes of the reference graph: anything that can be linked
// to. An entity without a `page` renders as plain text — safe to register
// early. Runs LAST in `make data`: it reads the other builds' JSON for the
// anchor-page datasets rather than re-parsing game files.

import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
import { iconPath } from './lib/icons.mjs';
import { loadEconomy } from './lib/economy.mjs';

const loc = loadLoc();
const econ = await loadEconomy();
const root = join(dataRoot(), 'game/common');
const { entries: goodsRaw } = await parseFolder(join(root, 'goods'));
const { entries: popTypesRaw } = await parseFolder(join(root, 'pop_types'));

const entities = [];

for (const [id, g] of Object.entries(goodsRaw)) {
  entities.push({
    id,
    type: 'good',
    slug: id,
    name: loc.name(id),
    icon: iconPath(g.texture, 'goods'),
    page: `goods/${id}`,
    group: g.category ?? null,
  });
}

for (const [id, b] of Object.entries(econ.buildings)) {
  if (b.building_group === 'bg_monuments_hidden') continue; // decorative dummies
  const slug = id.replace(/^building_/, '');
  entities.push({
    id,
    type: 'building',
    slug,
    name: loc.name(id),
    icon: iconPath(b.icon, 'buildings'),
    page: `buildings/${slug}`,
    group: b.building_group ? loc.name(b.building_group) : null,
  });
}

for (const [id, p] of Object.entries(popTypesRaw)) {
  entities.push({
    id,
    type: 'pop_type',
    slug: id,
    name: loc.name(id),
    icon: iconPath(p.texture, 'pops'),
    page: `pop-types#${id}`,
  });
}

// Anchor-page datasets from the generated JSON (this script runs last).
const gen = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url).pathname, 'utf8'));

for (const g of gen('laws.json').lawGroups) {
  for (const l of g.laws) {
    entities.push({ id: l.id, type: 'law', slug: l.id, name: l.name, icon: l.icon, page: `laws#${l.id}`, group: g.name });
  }
}
for (const t of gen('techs.json').techs) {
  entities.push({ id: t.id, type: 'technology', slug: t.id, name: t.name, icon: t.icon, page: `technology#${t.id}`, group: t.category });
}
for (const ig of gen('interest_groups.json').interestGroups) {
  entities.push({ id: ig.id, type: 'interest_group', slug: ig.id, name: ig.name, icon: ig.icon, page: `interest-groups#${ig.id}` });
}
for (const inst of gen('institutions.json').institutions) {
  entities.push({ id: inst.id, type: 'institution', slug: inst.id, name: inst.name, icon: inst.icon, page: `institutions#${inst.id}` });
}
for (const t of gen('character_traits.json').traits) {
  entities.push({ id: t.id, type: 'character_trait', slug: t.id, name: t.name, icon: t.icon, page: `character-traits#${t.id}`, group: t.type });
}
for (const d of gen('decrees.json').decrees) {
  entities.push({ id: d.id, type: 'decree', slug: d.id, name: d.name, icon: d.icon, page: `decrees#${d.id}` });
}
for (const c of gen('countries.json').countries) {
  entities.push({
    id: c.tag, type: 'country', slug: c.tag, name: c.name, icon: null,
    page: `countries#${c.tag}`, group: c.dynamic ? 'formable' : (c.type ?? null),
  });
}
for (const s of gen('states.json').states) {
  entities.push({
    id: s.id, type: 'state', slug: s.id, name: s.name, icon: null,
    page: `states#${s.id}`, group: s.region?.name ?? null,
  });
}
for (const t of gen('treaties.json').treaties) {
  entities.push({ id: t.id, type: 'treaty_article', slug: t.id, name: t.name, icon: t.icon, page: `treaties#${t.id}` });
}
for (const i of gen('power_blocs.json').identities) {
  entities.push({ id: i.id, type: 'bloc_identity', slug: i.id, name: i.name, icon: i.icon, page: `power-blocs#${i.id}` });
}
for (const c of gen('companies.json').companies) {
  entities.push({
    id: c.id, type: 'company', slug: c.id, name: c.name, icon: c.icon,
    page: `companies#${c.id}`, group: c.flavored ? 'historical' : 'basic',
  });
}
for (const u of gen('units.json').units) {
  entities.push({ id: u.id, type: 'unit', slug: u.id, name: u.name, icon: null, page: `units#${u.id}`, group: u.domain });
}
for (const c of gen('concepts.json').concepts) {
  entities.push({ id: c.id, type: 'concept', slug: c.id, name: c.name, icon: null, page: `concepts#${c.id}` });
}
for (const r of gen('religions.json').religions) {
  entities.push({ id: r.id, type: 'religion', slug: r.id, name: r.name, icon: r.icon, page: `cultures#${r.id}` });
}
for (const c of gen('cultures.json').cultures) {
  entities.push({ id: c.id, type: 'culture', slug: c.id, name: c.name, icon: null, page: `cultures#${c.id}` });
}
for (const s of gen('ships.json').shipTypes) {
  entities.push({ id: s.id, type: 'ship', slug: s.id, name: s.name, icon: null, page: `ships#${s.id}`, group: s.group?.name ?? null });
}
for (const j of gen('journal_entries.json').journalEntries) {
  entities.push({ id: j.id, type: 'journal_entry', slug: j.id, name: j.name, icon: null, page: `journal-entries#${j.id}`, group: j.group?.name ?? null });
}
for (const d of gen('decisions.json').decisions) {
  entities.push({ id: d.id, type: 'decision', slug: d.id, name: d.name, icon: null, page: `decisions#${d.id}` });
}
// Individual events stay out of search (volume); their groups are findable.
for (const g of gen('events.json').groups) {
  entities.push({ id: `events:${g.slug}`, type: 'event_group', slug: g.slug, name: `${g.name} Events`, icon: null, page: `events/${g.slug}` });
}

entities.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(
  new URL('../src/data/entities.json', import.meta.url).pathname,
  stableStringify({ entities }),
);

// Search index (only entities with pages) — same compact shape owreference
// uses: n=name, u=url, t=type, g=group, c=icon, a=aliases.
const searchIndex = entities
  .filter((e) => e.page)
  .map((e) => ({
    n: e.name,
    u: e.page,
    t: e.type,
    g: e.group ?? undefined,
    c: e.icon ?? undefined,
    a: e.id.toLowerCase(),
  }))
  .sort((a, b) => a.n.localeCompare(b.n));
writeFileSync(
  new URL('../public/data/search-index.json', import.meta.url).pathname,
  stableStringify(searchIndex),
);

console.log(`entities.json: ${entities.length} entities, search index: ${searchIndex.length}`);
