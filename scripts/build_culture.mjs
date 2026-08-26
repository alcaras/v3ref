// build_culture.mjs — emits:
//   src/data/cultures.json   cultures: heritage, language, religion,
//                            obsessions (goods links), traditions
//   src/data/religions.json  religions: heritage, taboos (goods links)
//   src/data/concepts.json   the in-game encyclopedia (game_concepts + loc)
//   src/data/defines.json    the constants, grouped by namespace

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, parseFile, asArray, stableStringify , idList } from './lib/pdx.mjs';
import { loadLoc } from './lib/loc.mjs';
import { iconPath } from './lib/icons.mjs';

const loc = loadLoc();
const root = dataRoot();

const [cultures, religions, concepts] = await Promise.all([
  parseFolder(join(root, 'game/common/cultures')),
  parseFolder(join(root, 'game/common/religions')),
  parseFolder(join(root, 'game/common/game_concepts')),
]);

const goodRefs = (ids) => idList(ids).map((g) => ({ id: g, name: loc.name(g) }));

const cultureList = Object.entries(cultures.entries).map(([id, c]) => ({
  id,
  name: loc.name(id),
  heritage: c.heritage ? { id: c.heritage, name: loc.name(c.heritage) } : null,
  language: c.language ? { id: c.language, name: loc.name(c.language) } : null,
  religion: c.religion ? { id: c.religion, name: loc.name(c.religion) } : null,
  obsessions: goodRefs(c.obsessions),
  traditions: idList(c.traditions).map((t) => loc.name(t)),
}));
cultureList.sort(
  (a, b) => (a.heritage?.name ?? '').localeCompare(b.heritage?.name ?? '') || a.name.localeCompare(b.name),
);
writeFileSync(
  new URL('../src/data/cultures.json', import.meta.url).pathname,
  stableStringify({ cultures: cultureList }),
);

const religionList = Object.entries(religions.entries).map(([id, r]) => ({
  id,
  name: loc.name(id),
  icon: iconPath(r.icon, 'religions'),
  heritage: r.heritage ? { id: r.heritage, name: loc.name(r.heritage) } : null,
  taboos: goodRefs(r.taboos),
  cultures: cultureList.filter((c) => c.religion?.id === id).length,
}));
religionList.sort(
  (a, b) => (a.heritage?.name ?? '').localeCompare(b.heritage?.name ?? '') || a.name.localeCompare(b.name),
);
writeFileSync(
  new URL('../src/data/religions.json', import.meta.url).pathname,
  stableStringify({ religions: religionList }),
);

// ── Concepts: name + resolved description, with cross-concept links ─
const conceptList = Object.keys(concepts.entries)
  .filter((id) => id !== 'concept_concept')
  .map((id) => {
    const desc = loc.resolve(`${id}_desc`);
    return {
      id,
      name: loc.name(id),
      description: desc?.text?.trim() ?? null,
      related: [...new Set((desc?.concepts ?? []).map((c) => c.concept))].filter(
        (c) => c !== id && concepts.entries[c],
      ),
    };
  })
  .filter((c) => c.description)
  .sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(
  new URL('../src/data/concepts.json', import.meta.url).pathname,
  stableStringify({ concepts: conceptList }),
);

// ── Defines, grouped by namespace ───────────────────────────────────
const defines = await parseFile(join(root, 'game/common/defines/00_defines.txt'));
const groups = Object.entries(defines)
  .filter(([, v]) => v && typeof v === 'object')
  .map(([ns, values]) => ({
    namespace: ns,
    values: Object.entries(values)
      .filter(([, v]) => typeof v !== 'object' || Array.isArray(v))
      .map(([k, v]) => ({ key: k, value: Array.isArray(v) ? v.join(', ') : String(v) })),
  }))
  .filter((g) => g.values.length);
writeFileSync(
  new URL('../src/data/defines.json', import.meta.url).pathname,
  stableStringify({ groups }),
);

console.log(
  `cultures.json: ${cultureList.length} · religions.json: ${religionList.length} · ` +
    `concepts.json: ${conceptList.length} · defines.json: ${groups.length} namespaces`,
);
