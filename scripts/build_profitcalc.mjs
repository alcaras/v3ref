// build_profitcalc.mjs — emits public/data/profit-calc.json, the slim dataset
// the Profit Calculator page fetches at runtime: every building's PM options
// with goods flows and jobs, plus goods base prices. Derived from the
// generated buildings.json/goods.json (run after build_buildings/build_goods).

import { writeFileSync, readFileSync } from 'node:fs';

const gen = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url).pathname, 'utf8'));
const { buildings } = gen('buildings.json');
const { goods } = gen('goods.json');
// Tag -> name, so the save importer can match meta_data.name ("Russia") to the
// tag that owns a market.
const countries = {};
for (const c of gen('countries.json').countries) countries[c.tag] = c.name;

const goodsOut = {};
for (const g of goods) goodsOut[g.id] = { name: g.name, cost: g.cost, icon: g.icon, index: g.index };

const buildingsOut = buildings
  .map((b) => ({
    id: b.id,
    name: b.name,
    icon: b.icon,
    group: b.groupRoot?.name ?? null,
    // Wonders and the great canals: one per world, so they never belong in a
    // "what should I build more of" ranking.
    unique: b.unique === true ? true : undefined,
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
        // What it takes to run this method. The audit uses these to keep its
        // advice to methods the save's country can actually switch to.
        techs: pm.techs?.length ? pm.techs.map((t) => t.id) : undefined,
        laws: pm.laws?.length ? pm.laws.map((l) => l.id) : undefined,
        blocked: pm.blockedByLaws?.length ? pm.blockedByLaws.map((l) => l.id) : undefined,
        // A sibling method this one needs — any one of them will do. Real
        // constraint across groups, so the combination search honours it.
        reqPms: pm.reqPms?.length ? pm.reqPms.map((o) => o.id) : undefined,
        reqPmNames: pm.reqPms?.length ? pm.reqPms.map((o) => o.name) : undefined,
        // Principles, identities, regions: conditions nothing here can check,
        // so they become a caveat on the row rather than a gate.
        needs: (() => {
          const req = new Set((pm.reqPms ?? []).map((o) => o.id));
          const rest = (pm.other ?? []).filter((o) => !req.has(o.id));
          return rest.length ? rest.map((o) => o.name) : undefined;
        })(),
      })),
    })),
  }))
  // Only buildings whose PMs actually move goods (skip monuments etc.).
  .filter((b) => b.pmGroups.some((g) => g.pms.some((pm) => pm.inputs.length || pm.outputs.length)));

writeFileSync(
  new URL('../public/data/profit-calc.json', import.meta.url).pathname,
  JSON.stringify({ buildings: buildingsOut, goods: goodsOut, countries }),
);
console.log(`profit-calc.json: ${buildingsOut.length} buildings`);
