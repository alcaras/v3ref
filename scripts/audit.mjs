// audit.mjs — the patch tripwire. Runs after `make data` and FAILS the build
// when the site would silently render something wrong:
//
//   1. modifier keys we render that neither the game's modifier definitions
//      nor our dynamic-key matcher recognizes (a new patch field we'd label
//      with a guessed Title Case name)
//   2. icon paths in generated JSON with no file in public/img
//   3. entity `page` targets that don't correspond to a built page
//   4. loc placeholders that leaked into generated text ($KEY$, [Data.Func])
//
// Exit code 1 on any failure. Warnings (icons for unbuilt sections) don't
// fail the run but are printed.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadLoc } from './lib/loc.mjs';
import { loadModifiers } from './lib/modifiers.mjs';

const DATA = new URL('../src/data/', import.meta.url).pathname;
const PUBLIC = new URL('../public/', import.meta.url).pathname;
const PAGES = new URL('../src/pages/', import.meta.url).pathname;

const loc = loadLoc();
const mods = await loadModifiers(loc);

const failures = [];
const warnings = [];

// changelog.json is a report about the data, not data — nothing to audit in it.
const jsonFiles = readdirSync(DATA).filter((f) => f.endsWith('.json') && f !== 'changelog.json');
const blobs = Object.fromEntries(
  jsonFiles.map((f) => [f, JSON.parse(readFileSync(join(DATA, f), 'utf8'))]),
);

// Walk every generated blob once, collecting the things we check.
const modifierKeys = new Set();
const iconPaths = new Set();
const leaks = new Map(); // sample text -> file

function walk(node, file) {
  if (Array.isArray(node)) {
    for (const v of node) walk(v, file);
    return;
  }
  if (!node || typeof node !== 'object') return;

  // A formatted modifier from modifiers.formatBag.
  if (typeof node.key === 'string' && typeof node.valueText === 'string') {
    modifierKeys.add(node.key);
  }
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') {
      if (k === 'icon' && v.startsWith('img/')) iconPaths.add(v);
      // Unresolved loc markup that should never reach the page.
      if (/\$[A-Za-z_][\w.]*\$/.test(v) || /\[[A-Z]\w*\.[\w.]+\]/.test(v)) {
        if (!leaks.has(v.slice(0, 80))) leaks.set(v.slice(0, 80), file);
      }
    } else {
      walk(v, file);
    }
  }
}
for (const [file, blob] of Object.entries(blobs)) walk(blob, file);

// 1. Modifier keys the game itself doesn't define.
const unknownMods = [...modifierKeys].filter((k) => !mods.def(k)).sort();
if (unknownMods.length) {
  failures.push(
    `${unknownMods.length} modifier key(s) not in modifier_type_definitions and not matched by ` +
      `matchDynamic() — they render with a guessed label:\n    ${unknownMods.slice(0, 20).join('\n    ')}` +
      (unknownMods.length > 20 ? `\n    …and ${unknownMods.length - 20} more` : ''),
  );
}

// 2. Icons referenced but not extracted.
const missingIcons = [...iconPaths].filter((p) => !existsSync(join(PUBLIC, p))).sort();
if (missingIcons.length) {
  failures.push(
    `${missingIcons.length} icon path(s) with no file in public/ (run \`make art\`):\n    ` +
      missingIcons.slice(0, 15).join('\n    ') +
      (missingIcons.length > 15 ? `\n    …and ${missingIcons.length - 15} more` : ''),
  );
}

// 3. Entity pages that don't exist. Anchor targets (page#id) only need the
//    base page; dynamic routes ([slug]) cover their whole family.
const pageExists = (page) => {
  const path = page.split('#')[0].replace(/\/$/, '');
  if (!path) return true;
  if (existsSync(join(PAGES, `${path}.astro`))) return true;
  const dir = path.split('/').slice(0, -1).join('/');
  return existsSync(join(PAGES, dir, '[slug].astro'));
};
const badPages = [...new Set(
  (blobs['entities.json']?.entities ?? []).filter((e) => e.page && !pageExists(e.page)).map((e) => e.page.split('#')[0]),
)].sort();
if (badPages.length) {
  failures.push(
    `${badPages.length} entity page target(s) with no matching route:\n    ` + badPages.slice(0, 15).join('\n    '),
  );
}

// 4. Claims the site makes about the data must stay true. The profit tools
//    tell the reader that every goods line is a flat amount and that groups
//    therefore do not interact. If a patch ever adds a percentage goods
//    modifier that stops being true, so fail here rather than let the page
//    keep asserting it.
const pmLines = JSON.parse(readFileSync(join(DATA, 'pms.json'), 'utf8')).pms
  .flatMap((pm) => [...pm.inputs, ...pm.outputs]);
const multGoods = pmLines.filter((l) => l.kind === 'mult');
if (multGoods.length) {
  failures.push(
    `${multGoods.length} percentage goods line(s) now exist (e.g. ${multGoods[0].name}). The profit ` +
      `calculator's copy claims goods lines are always flat and that PM groups do not interact — ` +
      `re-verify the greedy-vs-exhaustive claim and rewrite that copy.`,
  );
}

// 5. A stringified object in rendered text means an id list picked up an
//    empty `key = { }` block — see idList() in pdx.mjs. Never ship it.
const objectLeaks = Object.entries(blobs)
  .filter(([, blob]) => JSON.stringify(blob).includes('[object Object]'))
  .map(([file]) => file);
if (objectLeaks.length) {
  failures.push(
    `"[object Object]" reached generated data in: ${objectLeaks.join(', ')} — an id list read a ` +
      `non-string (empty \`key = { }\` block). Read id lists with idList(), not asArray().flat().`,
  );
}

// 6. Labels we invented. loc.name() falls back to Title Case when the game has
//    no text for an id; that is our wording, not the game's, so keep it visible.
let invented = [];
try {
  invented = JSON.parse(readFileSync(new URL('../data/invented-labels.json', import.meta.url).pathname, 'utf8'));
} catch { /* no pool yet — `make data` writes it */ }
if (invented.length) {
  warnings.push(
    `${invented.length} id(s) have no game text — displayed with a Title-Cased label we made up:\n    ` +
      invented.slice(0, 12).join('\n    ') +
      (invented.length > 12 ? `\n    …and ${invented.length - 12} more` : ''),
  );
}

// 7. Loc leaks — unresolved $KEY$ / [Scope.Function] in rendered text.
if (leaks.size) {
  warnings.push(
    `${leaks.size} generated string(s) still contain loc markup:\n    ` +
      [...leaks.entries()].slice(0, 8).map(([t, f]) => `${f}: ${t}`).join('\n    '),
  );
}

// ── Report ──────────────────────────────────────────────────────────
console.log(
  `audit: ${jsonFiles.length} datasets · ${modifierKeys.size} distinct modifier keys · ` +
    `${iconPaths.size} icon paths · ${(blobs['entities.json']?.entities ?? []).length} entities`,
);
for (const w of warnings) console.warn(`\n⚠ WARN  ${w}`);
for (const f of failures) console.error(`\n✗ FAIL  ${f}`);
if (failures.length) {
  console.error(`\naudit failed with ${failures.length} problem(s).`);
  process.exit(1);
}
console.log(`audit passed${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`);
