// pdx.mjs — the parse layer. Reads Paradox/Jomini script files (game/common/**)
// into plain JS objects via the jomini WASM parser.
//
// Conventions this layer establishes (everything downstream relies on them):
//   - parseFile/parseFolder return { key: value } maps merged across files.
//   - Duplicate keys inside one block come back as arrays (jomini's behavior).
//     ALWAYS access repeatable fields through asArray() — never assume shape.
//   - .md / .info / readme files in data folders are Paradox's own docs; skipped.
//   - The data root is external to this repo (see V3REF env / --v3ref flag);
//     nothing here ever writes to it.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Jomini } from 'jomini';

let _parser = null;
async function parser() {
  if (!_parser) _parser = await Jomini.initialize();
  return _parser;
}

/** Root of the game-files mirror (the v3ref folder). */
export function dataRoot() {
  return resolve(process.env.V3REF || '../v3ref');
}

/** Parse one Paradox script file into a JS object. */
export async function parseFile(path) {
  const p = await parser();
  const raw = readFileSync(path, 'utf8');
  try {
    return p.parseText(stripComments(raw));
  } catch (err) {
    throw new Error(`jomini failed on ${path}: ${err.message}`);
  }
}

// jomini QUIRK: a '#' comment ends at the first TAB, not at end-of-line, so
// Paradox's tab-aligned doc comments ("# goods\t\tThe good being referenced")
// leak stray tokens that collapse the whole file into a {remainder: [...]}
// mixed container. Strip comments ourselves, quote-aware, before parsing.
export function stripComments(text) {
  let out = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && text[i - 1] !== '\\') inQuote = !inQuote;
    if (c === '#' && !inQuote) {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    out += c;
  }
  return out.replace(/^﻿/, '');
}

/**
 * Parse every .txt file in a folder (non-recursive by default) and merge the
 * top-level keys into one map. Later files win on key collision, matching the
 * game's load order (files load alphabetically).
 * Returns { entries, sources } where sources maps key -> filename it came from.
 */
export async function parseFolder(folder, { recursive = false } = {}) {
  const entries = {};
  const sources = {};
  const files = listScriptFiles(folder, recursive);
  for (const f of files) {
    const parsed = await parseFile(f);
    for (const [k, v] of Object.entries(parsed)) {
      entries[k] = v;
      sources[k] = f.slice(folder.length + 1);
    }
  }
  return { entries, sources };
}

function listScriptFiles(folder, recursive) {
  const out = [];
  for (const name of readdirSync(folder).sort()) {
    const full = join(folder, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (recursive) out.push(...listScriptFiles(full, true));
      continue;
    }
    if (!name.endsWith('.txt')) continue; // .md/.info are docs, not data
    out.push(full);
  }
  return out;
}

/** Normalize a maybe-array (jomini emits arrays only for duplicated keys). */
export function asArray(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * A list of script ids from a `key = { a b c }` block.
 *
 * Paradox writes empty blocks as `traditions = { }`, which parses to `{}` —
 * so a bare asArray().flat() hands you an OBJECT where an id belongs, and it
 * ends up rendered as "[object Object]". Always read id lists through this.
 */
export function idList(v) {
  return asArray(v).flat().filter((x) => typeof x === 'string');
}

/** Stable stringify: sorted keys at every level, for diffable generated JSON. */
export function stableStringify(value, indent = 1) {
  return JSON.stringify(sortDeep(value), null, indent);
}
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
