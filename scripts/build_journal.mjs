// build_journal.mjs — emits:
//   src/data/journal_entries.json  JEs: name, reason, goal text, group,
//                                  timeout, which handlers they carry
//   src/data/decisions.json        decisions: name, desc, and the named
//                                  modifiers their effects grant (resolved
//                                  from static_modifiers)
//
// JE/decision logic is scripted; we surface the game's own player-facing
// text plus statically extractable rewards, not a re-implementation.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, asArray, stableStringify } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
import { loadModifiers } from './lib/modifiers.mjs';

const loc = loadLoc();
const mods = await loadModifiers(loc);
const root = join(dataRoot(), 'game/common');

const [jes, decisions, staticMods] = await Promise.all([
  parseFolder(join(root, 'journal_entries')),
  parseFolder(join(root, 'decisions')),
  parseFolder(join(root, 'static_modifiers')),
]);

// Recursively collect add_modifier { name = X } / add_modifier = X uses.
function grantedModifiers(block) {
  const found = new Set();
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    for (const [k, val] of Object.entries(v)) {
      if (k === 'add_modifier') {
        for (const m of asArray(val)) {
          if (typeof m === 'string') found.add(m);
          else if (m?.name) found.add(m.name);
        }
      } else if (typeof val === 'object') walk(val);
    }
  };
  walk(block);
  return [...found].map((id) => ({
    id,
    name: loc.name(id),
    modifiers: mods.formatBag(Object.assign({}, ...asArray(staticMods.entries[id]))).slice(0, 12),
  }));
}

const text = (key) => loc.resolve(key)?.text?.trim() || null;

const jeList = Object.entries(jes.entries).map(([id, je]) => ({
  id,
  name: loc.name(id),
  reason: text(`${id}_reason`),
  goal: text(`${id}_goal`),
  group: je.group ? { id: je.group, name: loc.name(je.group) } : null,
  timeout: je.timeout ?? null,
  hasCompletion: je.on_complete != null || je.complete != null,
  hasFailure: je.on_fail != null || je.fail != null,
  hasTimeout: je.on_timeout != null,
  rewards: grantedModifiers(je.on_complete),
  source: jes.sources[id],
}));
jeList.sort(
  (a, b) => (a.group?.name ?? 'zz').localeCompare(b.group?.name ?? 'zz') || a.name.localeCompare(b.name),
);
writeFileSync(
  new URL('../src/data/journal_entries.json', import.meta.url).pathname,
  stableStringify({ journalEntries: jeList }),
);

const decisionList = Object.entries(decisions.entries).map(([id, d]) => ({
  id,
  name: loc.name(id),
  desc: text(`${id}_desc`),
  rewards: grantedModifiers(d.when_taken),
}));
decisionList.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(
  new URL('../src/data/decisions.json', import.meta.url).pathname,
  stableStringify({ decisions: decisionList }),
);

console.log(`journal_entries.json: ${jeList.length} JEs · decisions.json: ${decisionList.length} decisions`);
