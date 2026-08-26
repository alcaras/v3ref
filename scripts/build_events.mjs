// build_events.mjs — emits src/data/events.json: every event grouped by its
// source file (which matches the game's own thematic organization), with
// title/description/flavor text, options, DLC gates, and the named modifiers
// each option grants (from static_modifiers).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, parseFolder, asArray, stableStringify } from './lib/pdx.mjs';
import { loadLoc, titleCase } from './lib/loc.mjs';
import { loadModifiers } from './lib/modifiers.mjs';

const loc = loadLoc();
const mods = await loadModifiers(loc);
const root = dataRoot();

const [events, staticMods] = await Promise.all([
  parseFolder(join(root, 'game/events'), { recursive: true }),
  parseFolder(join(root, 'game/common/static_modifiers')),
]);

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
    modifiers: mods.formatBag(Object.assign({}, ...asArray(staticMods.entries[id]))).slice(0, 8),
  }));
}

const text = (key) => (key ? loc.resolve(String(key))?.text?.trim() || null : null);

const byFile = new Map();
for (const [id, ev] of Object.entries(events.entries)) {
  if (!id.includes('.') || typeof ev !== 'object' || ev == null) continue; // skip `namespace = x` lines
  const source = events.sources[id];
  const options = asArray(ev.option).filter(Boolean).map((o) => ({
    name: text(o.name) ?? '—',
    isDefault: o.default_option === true || o.default_option === 'yes',
    rewards: grantedModifiers(o),
  }));
  if (!byFile.has(source)) byFile.set(source, []);
  byFile.get(source).push({
    id,
    title: text(ev.title) ?? titleCase(id.replace('.', ' ')),
    desc: text(ev.desc),
    flavor: text(ev.flavor),
    type: ev.type ?? null,
    dlc: ev.dlc ?? null,
    duration: ev.duration ?? null,
    options,
  });
}

const groups = [...byFile.entries()]
  .map(([source, list]) => ({
    source,
    slug: source
      .replace(/\.txt$/, '')
      .replace(/[\\/]/g, '--')
      .replace(/[^a-z0-9_-]+/gi, '_'),
    name: titleCase(
      source
        .replace(/\.txt$/, '')
        .split(/[\\/]/)
        .pop()
        .replace(/_?events?_?\d*/g, ' ')
        .trim() || source.replace(/\.txt$/, ''),
    ),
    events: list.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  new URL('../src/data/events.json', import.meta.url).pathname,
  stableStringify({ groups }),
);
const total = groups.reduce((s, g) => s + g.events.length, 0);
console.log(`events.json: ${total} events in ${groups.length} files`);
