// build_entities.mjs — the entity registry + site search index.
// Entities are the nodes of the reference graph: anything that can be linked
// to (goods now; buildings, pop types, laws, techs… as their pages land).
// An entity without a `page` renders as plain text — safe to register early.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
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
    icon: `img/goods/${String(g.texture ?? '').split('/').pop()?.replace(/\.dds$/, '')}.png`,
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
    icon: `img/buildings/${String(b.icon ?? '').split('/').pop()?.replace(/\.dds$/, '')}.png`,
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
    icon: `img/pops/${String(p.texture ?? '').split('/').pop()?.replace(/\.dds$/, '')}.png`,
    page: `pop-types#${id}`,
  });
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
