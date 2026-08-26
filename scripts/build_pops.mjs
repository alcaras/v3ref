// build_pops.mjs — emits:
//   src/data/pops.json       pop types: strata, wages, engagement, job counts
//   src/data/pop_needs.json  needs (goods entries + weights) and, per need,
//                            the buy-package range across wealth levels 1-99
//
// Strata come from the default social hierarchy (social_classes/00_default.txt
// allowed_professions); regional hierarchies (caste/Edo) reuse the same pops.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, asArray, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
import { loadEconomy } from './lib/economy.mjs';

const loc = loadLoc();
const econ = await loadEconomy();
const root = join(dataRoot(), 'game/common');

const [{ entries: popsRaw }, { entries: classesRaw }, { entries: needsRaw }, { entries: packagesRaw }] =
  await Promise.all([
    parseFolder(join(root, 'pop_types')),
    parseFolder(join(root, 'social_classes')),
    parseFolder(join(root, 'pop_needs')),
    parseFolder(join(root, 'buy_packages')),
  ]);

// pop type -> strata via the default hierarchy's classes.
const strataOf = {};
for (const cls of Object.values(classesRaw)) {
  if (cls.social_hierarchy !== 'default_social_hierarchy') continue;
  for (const p of asArray(cls.allowed_professions).flat()) strataOf[p] = cls.strata;
}

// pop type -> how many PMs employ it (a feel for demand).
const pmCount = {};
for (const jobs of econ.pmEmployment.values()) {
  for (const j of jobs) pmCount[j.popType] = (pmCount[j.popType] ?? 0) + 1;
}

const pops = Object.entries(popsRaw).map(([id, p]) => ({
  id,
  name: loc.name(id),
  icon: `img/pops/${String(p.texture ?? '').split('/').pop()?.replace(/\.dds$/, '')}.png`,
  strata: strataOf[id] ?? null,
  wageWeight: p.wage_weight ?? null,
  dependentWage: p.dependent_wage ?? null,
  paidPrivateWage: p.paid_private_wage === true || p.paid_private_wage === 'yes',
  unemployment: p.unemployment === true || p.unemployment === 'yes',
  unemploymentWealth: p.unemployment_wealth ?? null,
  canAlwaysHire: p.can_always_hire === true || p.can_always_hire === 'yes',
  startQualityOfLife: p.start_quality_of_life ?? null,
  engagementBase: p.political_engagement_base ?? null,
  engagementLiteracyFactor: p.political_engagement_literacy_factor ?? null,
  hasQualifications: p.qualifications != null,
  isSlave: id === 'slaves',
  pmsEmploying: pmCount[id] ?? 0,
}));

const STRATA_ORDER = ['upper', 'middle', 'lower'];
pops.sort(
  (a, b) =>
    STRATA_ORDER.indexOf(a.strata ?? 'lower') - STRATA_ORDER.indexOf(b.strata ?? 'lower') ||
    (b.wageWeight ?? 0) - (a.wageWeight ?? 0) ||
    a.name.localeCompare(b.name),
);

writeFileSync(new URL('../src/data/pops.json', import.meta.url).pathname, stableStringify({ pops }));

// Pop needs + the wealth range each need appears at in buy packages.
const packageRange = {}; // need -> {minWealth, maxWealth, minAmount, maxAmount}
for (const [wId, w] of Object.entries(packagesRaw)) {
  const wealth = Number(wId.replace('wealth_', ''));
  for (const [needId, amount] of Object.entries(w.goods ?? {})) {
    const r = (packageRange[needId] ??= { minWealth: wealth, maxWealth: wealth, minAmount: amount, maxAmount: amount });
    if (wealth < r.minWealth) { r.minWealth = wealth; r.minAmount = amount; }
    if (wealth > r.maxWealth) { r.maxWealth = wealth; r.maxAmount = amount; }
  }
}

const needs = Object.entries(needsRaw).map(([id, need]) => ({
  id,
  name: loc.name(id),
  default: need.default ?? null,
  entries: asArray(need.entry)
    .filter((e) => e?.goods)
    .map((e) => ({
      good: e.goods,
      name: loc.name(e.goods),
      weight: e.weight ?? 1,
      maxSupplyShare: e.max_supply_share ?? null,
      minSupplyShare: e.min_supply_share ?? null,
    })),
  buyPackages: packageRange[id] ?? null,
}));
needs.sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  new URL('../src/data/pop_needs.json', import.meta.url).pathname,
  stableStringify({ needs }),
);

console.log(`pops.json: ${pops.length} pop types · pop_needs.json: ${needs.length} needs`);
