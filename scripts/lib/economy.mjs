// economy.mjs — loads the building → PM-group → production-method chain and
// projects it into the typed edge lists every economy page queries:
//
//   building ─has─▶ pmg ─offers─▶ pm ─{consumes|produces qty}─▶ good
//                                 pm ─employs qty─▶ pop type
//
// Quantities come from building_modifiers.workforce_scaled (goods) and
// level_scaled (employment) and are PER BUILDING LEVEL at full employment —
// the `# x20 = 800` comments in the game files are price math (qty × base
// cost), not different numbers. Some late-game PMs use _mult keys (throughput
// style); those are kept with kind 'mult' and rendered as percentages.

import { join } from 'node:path';
import { dataRoot, parseFolder, asArray } from './pdx.mjs';

export async function loadEconomy() {
  const root = join(dataRoot(), 'game/common');
  const [buildings, pmgs, pms, buildingGroups] = await Promise.all([
    parseFolder(join(root, 'buildings')),
    parseFolder(join(root, 'production_method_groups')),
    parseFolder(join(root, 'production_methods')),
    parseFolder(join(root, 'building_groups')),
  ]);

  // pmg -> buildings that offer it (a pmg can be shared by several buildings)
  const pmgBuildings = new Map();
  for (const [bId, b] of Object.entries(buildings.entries)) {
    for (const pmgId of asArray(b.production_method_groups).flat()) {
      if (!pmgBuildings.has(pmgId)) pmgBuildings.set(pmgId, []);
      pmgBuildings.get(pmgId).push(bId);
    }
  }

  // pm -> [{building, pmg}]
  const pmSites = new Map();
  for (const [pmgId, pmg] of Object.entries(pmgs.entries)) {
    for (const pmId of asArray(pmg.production_methods).flat()) {
      if (!pmSites.has(pmId)) pmSites.set(pmId, []);
      for (const bId of pmgBuildings.get(pmgId) ?? []) {
        pmSites.get(pmId).push({ building: bId, pmg: pmgId });
      }
    }
  }

  // Per-PM goods and employment lines.
  const pmGoods = new Map();      // pmId -> [{good, dir, kind, amount}]
  const pmEmployment = new Map(); // pmId -> [{popType, amount}]
  for (const [pmId, pm] of Object.entries(pms.entries)) {
    const goods = [];
    const jobs = [];
    for (const block of asArray(pm.building_modifiers)) {
      for (const scale of ['workforce_scaled', 'level_scaled', 'unscaled']) {
        for (const sub of asArray(block?.[scale])) {
          for (const [key, value] of Object.entries(sub ?? {})) {
            let m = /^goods_(input|output)_(\w+?)_(add|mult)$/.exec(key);
            if (m) {
              goods.push({ good: m[2], dir: m[1], kind: m[3], amount: Number(value), scale });
              continue;
            }
            m = /^building_employment_(\w+?)_add$/.exec(key);
            if (m) jobs.push({ popType: m[1], amount: Number(value) });
          }
        }
      }
    }
    if (goods.length) pmGoods.set(pmId, goods);
    if (jobs.length) pmEmployment.set(pmId, jobs);
  }

  return {
    buildings: buildings.entries,
    buildingGroups: buildingGroups.entries,
    pmgs: pmgs.entries,
    pms: pms.entries,
    pmgBuildings,
    pmSites,
    pmGoods,
    pmEmployment,
  };
}
