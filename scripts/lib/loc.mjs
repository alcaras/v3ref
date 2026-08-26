// loc.mjs — the localization layer. Vic3 loc files are a YAML dialect:
//
//   l_english:
//    some_key:0 "Text with $other_key$ refs, #b bold#! runs, @goods_icon! and
//                [Concept('concept_x','shown text')] data-functions"
//
// This module loads every English loc file (game/localization/english/** plus
// the shared modifiers/ and jomini/ loc) into one map and resolves a key to
// display text:
//   - $key$      → recursive substitution (cycle-guarded). `$key|codes$` pipe
//                  format codes are dropped.
//   - #tag …#!   → formatting run; tags are stripped, inner text kept.
//   - [Concept('concept_x','text')] → the given text, recorded in `concepts`
//                  so callers can turn it into an entity link.
//   - [AnyOther.DataFunction] → cannot resolve statically; replaced with '…'.
//   - @icon!     → kept verbatim; renderers map known icons, strip unknown.
//
// resolve() returns { text, concepts } — use text for plain display, concepts
// to auto-link. get() returns the raw unresolved string.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot } from './pdx.mjs';

const LINE_RE = /^\s*([\w.\-']+):\d*\s*"(.*)"[^"]*$/;

export function loadLoc({ extraDirs = [] } = {}) {
  const root = dataRoot();
  const dirs = [
    join(root, 'game/localization/english'),
    join(root, 'game/localization/modifiers'),
    join(root, 'game/localization/jomini'),
    ...extraDirs,
  ];
  const map = new Map();
  for (const dir of dirs) {
    for (const file of ymlFiles(dir)) {
      // modifiers/ and jomini/ hold every language side by side — English only.
      if (/_l_(?!english)/.test(file)) continue;
      const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
      for (const line of text.split('\n')) {
        const m = LINE_RE.exec(line);
        if (m) map.set(m[1], m[2]);
      }
    }
  }
  return new Loc(map);
}

function ymlFiles(dir, out = []) {
  let names;
  try { names = readdirSync(dir).sort(); } catch { return out; }
  for (const n of names) {
    const full = join(dir, n);
    if (statSync(full).isDirectory()) ymlFiles(full, out);
    else if (n.endsWith('.yml')) out.push(full);
  }
  return out;
}

export class Loc {
  constructor(map) { this.map = map; }

  has(key) { return this.map.has(key); }
  get(key) { return this.map.get(key); }

  /** Display name for a script key; falls back to Title Casing the id. */
  name(key) {
    const r = this.resolve(key);
    return r && r.text.trim() ? r.text : titleCase(key);
  }

  /** Fully resolve a loc key. Returns { text, concepts } or null if missing. */
  resolve(key) {
    if (!this.map.has(key)) return null;
    return this.resolveText(this.map.get(key));
  }

  /** Resolve a raw loc string (substitutions, markup, data-functions). */
  resolveText(raw, _depth = 0) {
    const concepts = [];
    let text = raw;

    // $key$ substitution — bounded depth guards accidental cycles.
    if (_depth < 8) {
      text = text.replace(/\$([\w.\-']+)(?:\|[^$]*)?\$/g, (whole, k) => {
        if (!this.map.has(k)) return whole;
        const inner = this.resolveText(this.map.get(k), _depth + 1);
        concepts.push(...inner.concepts);
        return inner.text;
      });
    }

    // [Concept('concept_x','shown text')] and [concept_x] shorthands.
    text = text.replace(
      /\[Concept\(\s*'([\w-]+)'\s*,\s*'([^']*)'\s*\)\]/g,
      (_, id, shown) => {
        const inner = this.resolveText(shown, _depth + 1);
        concepts.push({ concept: id, text: inner.text });
        return inner.text;
      },
    );
    text = text.replace(/\[concept_([\w-]+)\]/g, (_, id) => {
      const key = `concept_${id}`;
      const shown = this.map.has(key)
        ? this.resolveText(this.map.get(key), _depth + 1).text
        : titleCase(id);
      concepts.push({ concept: key, text: shown });
      return shown;
    });

    // Any other [DataFunction] can't be known at build time.
    text = text.replace(/\[[^\]]*\]/g, '…');

    // Formatting runs: '#tag ' opens, '#!' closes — keep inner text only.
    text = text.replace(/#[\w;:.]+ /g, '').replace(/#!/g, '');

    // Escaped newlines/tabs in loc strings.
    text = text.replace(/\\n/g, '\n').replace(/\\t/g, ' ');

    return { text, concepts };
  }
}

export function titleCase(id) {
  return String(id)
    .replace(/^(building_|pm_|pmg_|popneed_|law_|tech_|concept_)/, '')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
