// build_goods.mjs — emits src/data/goods.json: every good with its base stats,
// the production methods that produce/consume it (with per-level quantities and
// the buildings they run in), and the pop needs it satisfies (with the rival
// goods competing in that need). Run via `make data`.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
import { loadEconomy } from './lib/economy.mjs';

const loc = loadLoc();
const econ = await loadEconomy();
const root = join(dataRoot(), 'game/common');

const { entries: goodsRaw } = await parseFolder(join(root, 'goods'));
const { entries: needsRaw } = await parseFolder(join(root, 'pop_needs'));

// good -> [{need, weight, isDefault}]
const needsByGood = new Map();
for (const [needId, need] of Object.entries(needsRaw)) {
  const entries = Array.isArray(need.entry) ? need.entry : [need.entry].filter(Boolean);
  for (const e of entries) {
    if (!e?.goods) continue;
    if (!needsByGood.has(e.goods)) needsByGood.set(e.goods, []);
    needsByGood.get(e.goods).push({
      need: needId,
      name: loc.name(needId),
      weight: e.weight ?? 1,
      isDefault: need.default === e.goods,
      rivals: entries
        .filter((r) => r?.goods && r.goods !== e.goods)
        .map((r) => ({ good: r.goods, weight: r.weight ?? 1 })),
    });
  }
}

// good -> producers/consumers from the PM graph.
const flows = new Map(); // goodId -> {producers: [], consumers: []}
function flow(goodId) {
  if (!flows.has(goodId)) flows.set(goodId, { producers: [], consumers: [] });
  return flows.get(goodId);
}
for (const [pmId, lines] of econ.pmGoods) {
  const sites = econ.pmSites.get(pmId) ?? [];
  for (const line of lines) {
    const rec = {
      pm: pmId,
      pmName: loc.name(pmId),
      amount: line.amount,
      kind: line.kind, // 'add' = units per level, 'mult' = percentage
      buildings: [...new Set(sites.map((s) => s.building))].map((b) => ({
        id: b,
        name: loc.name(b),
      })),
    };
    const side = line.dir === 'output' ? 'producers' : 'consumers';
    flow(line.good)[side].push(rec);
  }
}

const goods = Object.entries(goodsRaw).map(([id, g]) => {
  const f = flows.get(id) ?? { producers: [], consumers: [] };
  const bySize = (a, b) => b.amount - a.amount || a.pm.localeCompare(b.pm);
  return {
    id,
    slug: id,
    name: loc.name(id),
    category: g.category ?? 'staple',
    cost: g.cost ?? 0,
    prestigeFactor: g.prestige_factor ?? 0,
    tradedQuantity: g.traded_quantity ?? null,
    obsessionChance: g.obsession_chance ?? 0,
    convoyCostMultiplier: g.convoy_cost_multiplier ?? null,
    icon: `img/goods/${String(g.texture ?? '').split('/').pop()?.replace(/\.dds$/, '')}.png`,
    producers: f.producers.sort(bySize),
    consumers: f.consumers.sort(bySize),
    needs: (needsByGood.get(id) ?? []).sort((a, b) => a.need.localeCompare(b.need)),
    // No PM touches it and no pop wants it — dead/legacy content, badge it.
    unused: !f.producers.length && !f.consumers.length && !needsByGood.has(id),
  };
});

const CATEGORY_ORDER = ['staple', 'industrial', 'luxury', 'military'];
goods.sort(
  (a, b) =>
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
    a.name.localeCompare(b.name),
);

const out = new URL('../src/data/goods.json', import.meta.url).pathname;
writeFileSync(out, stableStringify({ goods }));
console.log(
  `goods.json: ${goods.length} goods ` +
    `(${goods.filter((g) => g.unused).length} unused/legacy), ` +
    `${[...econ.pmGoods.keys()].length} PMs with goods flows`,
);
