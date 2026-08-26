// build_profitcalc.mjs — emits public/data/profit-calc.json, the slim dataset
// the Profit Calculator page fetches at runtime: every building's PM options
// with goods flows and jobs, plus goods base prices. Derived from the
// generated buildings.json/goods.json (run after build_buildings/build_goods).

import { writeFileSync, readFileSync } from 'node:fs';

const gen = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url).pathname, 'utf8'));
const { buildings } = gen('buildings.json');
const { goods } = gen('goods.json');

const goodsOut = {};
for (const g of goods) goodsOut[g.id] = { name: g.name, cost: g.cost, icon: g.icon };

const buildingsOut = buildings
  .map((b) => ({
    id: b.id,
    name: b.name,
    icon: b.icon,
    group: b.groupRoot?.name ?? null,
    // Construction points the building costs — the denominator for
    // "profit per point of construction" in the comparison table.
    construction: b.construction?.value ?? null,
    pmGroups: b.pmGroups.map((g) => ({
      name: g.name,
      pms: g.pms.map((pm) => ({
        id: pm.id,
        name: pm.name,
        icon: pm.icon,
        inputs: pm.inputs.map((l) => ({ g: l.good, a: l.amount, k: l.kind })),
        outputs: pm.outputs.map((l) => ({ g: l.good, a: l.amount, k: l.kind })),
        jobs: pm.jobs.map((j) => ({ p: j.name, a: j.amount })),
      })),
    })),
  }))
  // Only buildings whose PMs actually move goods (skip monuments etc.).
  .filter((b) => b.pmGroups.some((g) => g.pms.some((pm) => pm.inputs.length || pm.outputs.length)));

writeFileSync(
  new URL('../public/data/profit-calc.json', import.meta.url).pathname,
  JSON.stringify({ buildings: buildingsOut, goods: goodsOut }),
);
console.log(`profit-calc.json: ${buildingsOut.length} buildings`);
