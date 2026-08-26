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

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
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

// Every build script runs in its own process, so the ids we had to invent
// labels for are pooled in one file that the audit reads afterwards.
// `make data` clears it at the start of a run.
export const INVENTED_LOG = new URL('../../data/invented-labels.json', import.meta.url).pathname;

export class Loc {
  constructor(map) {
    this.map = map;
    this.invented = new Set();
    // Flush on exit rather than per-call: a build resolves tens of thousands
    // of names and most of them succeed.
    process.on('exit', () => {
      if (!this.invented.size) return;
      let pooled = [];
      try { pooled = JSON.parse(readFileSync(INVENTED_LOG, 'utf8')); } catch {}
      const merged = [...new Set([...pooled, ...this.invented])].sort();
      try { writeFileSync(INVENTED_LOG, JSON.stringify(merged, null, 1)); } catch {}
    });
  }

  has(key) { return this.map.has(key); }
  get(key) { return this.map.get(key); }

  /**
   * Display name for a script key.
   *
   * The game does not use one naming convention: a law group is `lawgroup_x`,
   * a country tier is `country_tier_x`, a law-group category is bare
   * `POWER_STRUCTURE`. So try the id, then the caller's known prefixes, then
   * the uppercase form, before giving up.
   *
   * Giving up means Title-Casing the id — a LABEL WE INVENTED, not the game's
   * word for the thing. Those are recorded in `invented` so the audit can
   * report them instead of letting them pass as if they came from the game.
   */
  name(key, prefixes = []) {
    for (const candidate of [key, ...prefixes.map((p) => `${p}${key}`), String(key).toUpperCase()]) {
      const r = this.resolve(candidate);
      if (!r) continue;
      const text = r.text.trim();
      // Some ids only have a TEMPLATED string, e.g. war_goal_conquer_state is
      // "Conquer [WAR_GOAL_DRAFT.GetTargetState.GetName]" — a runtime sentence,
      // not a label. Resolving it statically yields "Conquer …", which is worse
      // than nothing, so a name with an elision is not a name.
      if (text && !text.includes('…')) return text;
    }
    this.invented.add(key);
    return titleCase(key);
  }

  /** Ids we had no game text for, and therefore labelled ourselves. */
  get inventedNames() {
    return [...this.invented].sort();
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

    // $key$ substitution — bounded depth guards accidental cycles. Unresolved
    // refs are UI-layer tokens: bullets render as bullets, the rest elide.
    if (_depth < 8) {
      text = text.replace(/\$([\w.\-']+)(?:\|[^$]*)?\$/g, (whole, k) => {
        if (!this.map.has(k)) return /BULLET/i.test(k) ? '• ' : '…';
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

    // Inline icon tokens ('@aristocrats!') — we render real icons separately,
    // so plain text drops them.
    text = text.replace(/@[\w.-]+!\s*/g, '');

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
