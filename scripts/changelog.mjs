// changelog.mjs — per-patch diffing. Compares every generated src/data/*.json
// against the snapshot of the last build tag and writes CHANGELOG.md, so a
// patch's real content changes surface without reading the whole diff.
//
//   node scripts/changelog.mjs            # diff vs the newest snapshot
//   node scripts/changelog.mjs --snapshot # then store the current data as the
//                                         # snapshot for this patch version
//
// Datasets are keyed lists (goods, buildings, laws…) — we detect the id field,
// then report added / removed / changed entries with field-level detail.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const DATA = new URL('../src/data/', import.meta.url).pathname;
const SNAPS = new URL('../data/snapshots/', import.meta.url).pathname;
const patch = JSON.parse(readFileSync(new URL('../data/patch.json', import.meta.url).pathname, 'utf8'));

// The changelog's own output lives in src/data too — never diff or snapshot it.
const SELF = 'changelog.json';
const dataFiles = () => readdirSync(DATA).filter((f) => f.endsWith('.json') && f !== SELF);

const takeSnapshot = process.argv.includes('--snapshot');
const version = patch.version.replace(/[^\w.]+/g, '_');

if (takeSnapshot) {
  const dest = join(SNAPS, version);
  mkdirSync(dest, { recursive: true });
  // Snapshots are gzipped — the raw set is ~10MB a patch, mostly events.json.
  for (const f of dataFiles()) {
    writeFileSync(join(dest, `${f}.gz`), gzipSync(readFileSync(join(DATA, f))));
  }
  console.log(`snapshot: stored ${version}`);
  process.exit(0);
}

const snapshots = existsSync(SNAPS)
  ? readdirSync(SNAPS).filter((d) => existsSync(join(SNAPS, d, 'goods.json.gz'))).sort()
  : [];
const readSnap = (file) => JSON.parse(gunzipSync(readFileSync(join(PREV, `${file}.gz`))).toString('utf8'));
if (!snapshots.length) {
  console.log('changelog: no snapshot yet — run `node scripts/changelog.mjs --snapshot` to seed one.');
  process.exit(0);
}
const prevVersion = snapshots[snapshots.length - 1];
const PREV = join(SNAPS, prevVersion);

// The one array a dataset is really about, and the field that identifies a row.
function mainList(blob) {
  for (const [key, val] of Object.entries(blob ?? {})) {
    if (Array.isArray(val) && val.length && typeof val[0] === 'object') return { key, list: val };
  }
  return null;
}
const idOf = (row) => row.id ?? row.tag ?? row.slug ?? row.namespace ?? row.source ?? null;

// Compare two rows, ignoring nested arrays of objects (too noisy — their
// presence/absence is reported at the row level).
function fieldDiffs(a, b) {
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const av = a[k], bv = b[k];
    const simple = (v) => v == null || typeof v !== 'object';
    if (simple(av) && simple(bv)) {
      if (av !== bv) out.push(`${k}: ${fmt(av)} → ${fmt(bv)}`);
    } else {
      const as = JSON.stringify(av), bs = JSON.stringify(bv);
      if (as !== bs) {
        const an = Array.isArray(av) ? av.length : null;
        const bn = Array.isArray(bv) ? bv.length : null;
        out.push(an != null && bn != null && an !== bn ? `${k}: ${an} → ${bn} entries` : `${k} changed`);
      }
    }
  }
  return out;
}
const fmt = (v) => (v === null || v === undefined ? '—' : String(v));

const sections = [];
for (const file of dataFiles().sort()) {
  if (!existsSync(join(PREV, `${file}.gz`))) {
    sections.push({ file, isNew: true, added: [], removed: [], changed: [] });
    continue;
  }
  const cur = mainList(JSON.parse(readFileSync(join(DATA, file), 'utf8')));
  const old = mainList(readSnap(file));
  if (!cur || !old) continue;

  const curById = new Map(cur.list.map((r) => [idOf(r), r]).filter(([k]) => k));
  const oldById = new Map(old.list.map((r) => [idOf(r), r]).filter(([k]) => k));
  const added = [...curById.keys()].filter((k) => !oldById.has(k));
  const removed = [...oldById.keys()].filter((k) => !curById.has(k));
  const changed = [];
  for (const [k, row] of curById) {
    if (!oldById.has(k)) continue;
    const diffs = fieldDiffs(oldById.get(k), row);
    if (diffs.length) changed.push({ id: k, name: row.name ?? k, diffs });
  }
  if (added.length || removed.length || changed.length) {
    sections.push({ file, added, removed, changed, curById });
  }
}

const nameOf = (section, id) => section.curById?.get(id)?.name ?? id;
const lines = [
  '# Changelog',
  '',
  `Generated diff of the site's data between **${prevVersion.replace(/_/g, ' ')}** and **${patch.version}**.`,
  '',
];
if (!sections.length) {
  lines.push('No data changes detected.');
} else {
  for (const s of sections) {
    lines.push(`## ${s.file.replace('.json', '')}`, '');
    if (s.isNew) {
      lines.push('- New dataset in this build.', '');
      continue;
    }
    if (s.added.length) {
      lines.push(`**Added (${s.added.length}):** ${s.added.slice(0, 30).map((id) => nameOf(s, id)).join(', ')}` +
        (s.added.length > 30 ? `, …` : ''), '');
    }
    if (s.removed.length) {
      lines.push(`**Removed (${s.removed.length}):** ${s.removed.slice(0, 30).join(', ')}` +
        (s.removed.length > 30 ? `, …` : ''), '');
    }
    if (s.changed.length) {
      lines.push(`**Changed (${s.changed.length}):**`, '');
      for (const c of s.changed.slice(0, 40)) {
        lines.push(`- **${c.name}** — ${c.diffs.slice(0, 6).join('; ')}`);
      }
      if (s.changed.length > 40) lines.push(`- …and ${s.changed.length - 40} more`);
      lines.push('');
    }
  }
}

writeFileSync(new URL('../CHANGELOG.md', import.meta.url).pathname, lines.join('\n'));

// Same diff as structured data, for the Patch Notes page.
writeFileSync(
  new URL('../src/data/changelog.json', import.meta.url).pathname,
  JSON.stringify(
    {
      from: prevVersion.replace(/_/g, ' ').trim(),
      to: patch.version,
      sections: sections.map((s) => ({
        dataset: s.file.replace('.json', ''),
        isNew: !!s.isNew,
        added: s.added.map((id) => ({ id, name: nameOf(s, id) })),
        removed: s.removed,
        changed: s.changed,
      })),
    },
    null,
    1,
  ),
);
const totals = sections.reduce(
  (t, s) => ({ a: t.a + s.added.length, r: t.r + s.removed.length, c: t.c + s.changed.length }),
  { a: 0, r: 0, c: 0 },
);
console.log(
  `changelog: ${prevVersion} → ${version} · ${totals.a} added, ${totals.r} removed, ${totals.c} changed ` +
    `across ${sections.length} dataset(s)`,
);
