# CLAUDE.md — agent guide for v3reference

Sibling of [owreference](https://github.com/alcaras/owreference) (Old World), same
philosophy for Victoria 3: an Astro static site that is a **deterministic
projection of the game's own files**, re-generated each patch.

**Live:** https://alcaras.github.io/v3reference/ · **Source:** https://github.com/alcaras/v3reference

---

## The core idea

The game's script files (Paradox/Jomini format) are mirrored in a sibling
`v3ref/` folder (script + localization only, no gfx — synced from a Steam
install each patch). Build scripts parse them into `src/data/*.json`, Astro
renders those. Every fact on the site must be derivable from the game files;
generated JSON is committed so GitHub Actions only runs `astro build`.

Point the pipeline at the mirror with `V3REF` (defaults to `../v3ref`):

```
make data    node scripts/build_*.mjs → src/data/*.json (+ public/data/search-index.json)
make art     scripts/extract_art.sh   → DDS→PNG from a local game install (VIC3_APP)
make build   npx astro build          → dist/
```

---

## Architecture: three layers + one graph

**1. Parse layer** — `scripts/lib/pdx.mjs`. The `jomini` npm package (WASM)
parses Paradox script. All file access goes through `parseFile`/`parseFolder`.
Duplicate keys become arrays — always use `asArray()`. Comments are stripped
by us before parsing (see Quirks). `.md`/`.info` files in data folders are
Paradox's own docs — read them when a field is unclear; never parse them.

**2. Meaning layer** — the two libraries every page sits on:

- `scripts/lib/loc.mjs` — the localization engine. Loads every English loc
  file into one map; `resolve()` handles `$key$` recursion, strips `#b …#!`
  formatting runs, extracts `[Concept('x','text')]` into a `concepts` list
  (auto-link source), replaces unresolvable `[DataFunctions]` with `…`.
- `scripts/lib/modifiers.mjs` — the "humanizer", except Vic3 ships it: display
  rules come from `common/modifier_type_definitions/` (percent/decimals/
  good-bad direction) plus modifier loc names. `format(key, value)` →
  `{label, valueText, tone}`. Dynamic per-good keys (`goods_input_<g>_add`,
  `building_employment_<pop>_add`) are reconstructed by `matchDynamic()`.
  **Every "what does it do" line on the site should go through this** — never
  hand-format a modifier.

**3. View layer** — `scripts/build_<thing>.mjs` emits page-shaped JSON
(deterministic: `stableStringify`), Astro pages render it. Shared domain
loaders live in `scripts/lib/` (e.g. `economy.mjs`) so datasets are parsed
once and projected many ways.

**The graph.** The abstraction that makes visualization tractable: model the
game as typed nodes (goods, buildings, PMs, techs, laws, …) and typed edges
(`produces`, `consumes`, `employs`, `unlocks`, `requires`, `approves`, …) with
quantities on the edges. `economy.mjs` builds the economy subgraph
(building → PM group → PM → goods/jobs). Backlinks, production-chain diagrams,
tech trees, and reverse-lookup tables ("everything this tech unlocks") are all
*queries over edges*, not bespoke scrapes. When adding a dataset, first ask:
what nodes and edges does it contribute?

**Layout in the data layer, dumb SVG in components.** When a page needs a
diagram (chains, trees), compute positions in the build script (Node) and emit
plain coordinates; the Astro component just draws. No client-side layout
libraries — pages stay static and fast, and diagrams are diffable JSON.

---

## Design rules (LOAD-BEARING — don't drift)

Inherited from owreference's design pass, re-tokened for Vic3:

1. **Dark mode only.** Warm charcoal base, brass-gold accent (`--gold`),
   ledger-grid texture. Playfair Display for headings, Inter body, JetBrains
   Mono for footer/kbd labels. No all-caps outside mono/eyebrow labels.
2. **Categorical color = goods category** (`.cat-staple/industrial/luxury/
   military`), shown as a 3px left bar on lead cells and dot chips — never as
   cell backgrounds.
3. **Modifier tones**: `.tone-good` (teal-green) / `.tone-bad` (red) /
   `.tone-neutral`, direction from `modifiers.mjs` (`color = good` means
   higher-is-better — the sign alone doesn't decide the tone).
4. **Everything is a link, PKM-style.** Entity references go through
   `<Term id=… />` (renders plain text until the entity's page exists — safe
   everywhere). The loc engine's `concepts` output is the auto-link feed.
5. **Tables**: `.vtbl` inside `.grid__scroll` (sticky header, horizontal
   scroll). Reuse `.lead`, `.sect`, `.stat`, `.chip`, `.catchip`, `.caption` —
   don't invent new classes when these fit.
6. **In-game numbers verbatim** — show the value the player sees; document any
   scaling in a `.caption` under the table.
7. **Header nav + home index share one source of truth**: `src/data/tabs.ts`.
   Nav shows `built` pages; the index also shows `placeholder` ones dimmed.
   Building a page = flip its status to `built`.

---

## How to build a new page

1. **Find the data** in `$V3REF/game/common/<folder>/` (read the in-folder
   `.md` docs). Gameplay numbers are almost all in `common/`; text in
   `localization/english/`; constants in `common/defines/`.
2. **Write `scripts/build_<thing>.mjs`**: parse via `pdx.mjs`, names via
   `loc.mjs`, effects via `modifiers.mjs` (`formatBag` for whole modifier
   blocks), emit with `stableStringify`. Register in the Makefile `data:`
   target. If the dataset has relationships, extend the relevant `lib/` loader
   (or add one) rather than scraping inline.
3. **Render** `src/pages/<slug>.astro` off `goods.astro` (list) or
   `goods/[slug].astro` (detail). Register new entities in
   `build_entities.mjs` (registry + search index) and set `page` so existing
   `<Term>`s light up site-wide.
4. **Flip the tab** to `built` in `src/data/tabs.ts`; `make data build`.

Validation oracle: the PyHelpersForPDXWikis toolkit (grotaclas) generates the
official wiki's tables from the same files — cross-check numbers there or
against the wiki before trusting a new interpretation, the way owreference
used the legacy spreadsheet.

---

## Source-of-truth rules

1. Game files win on facts. No hand-maintained data files; curation lives in
   build scripts with comments.
2. `v3ref/` is read-only from here — never write into it (its sync script
   mirror-deletes). Icons come from a real install (`VIC3_APP`), not v3ref.
3. Unlike Old World, there is no shipped C# source. The script files + 
   `common/defines/` + `gui/`·`data_binding/` (UI formulas) cover most logic;
   the exe is a last resort, not a habit.
4. DLC gameplay content ships inside `game/common` (the `game/dlc/` folders
   are manifests/music) — gate badges come from `required_dlc`-style fields on
   the content itself, not from file location.

---

## Quirks already discovered (don't re-debug)

- **jomini ends a `#` comment at the first TAB, not end-of-line.** Paradox's
  tab-aligned doc comments then leak tokens and the whole file collapses into
  a `{remainder: [...]}` mixed container (pop_needs did this). `pdx.mjs`
  strips comments quote-aware before parsing — keep it that way.
- **PM quantities are per building level at full employment.** The
  `# x20 = 800` comments in PM files are price math (qty × base cost), not
  alternative values. `workforce_scaled` = goods, `level_scaled` = jobs.
- **A PM group can be shared by several buildings** (e.g. fertilizer PMGs
  across farm types) — always map pm → sites via `pmgBuildings`, never assume
  one building.
- **`goods_input_*` is a cost**: its modifier tone is `bad` when positive.
  Outputs are `good`. Employment is bookkeeping — `neutral`.
- **Two goods are dead content** (`manowars`, `ironclads` as of 1.13): no PM
  touches them, no need wants them. The `unused` flag on goods.json catches
  this class automatically — badge, don't delete.
- **Loc files exist for all languages side by side** in `localization/
  modifiers/` and `jomini/` — filter to `_l_english` (loc.mjs does).
- **Dropbox hydration**: the v3ref mirror may be online-only; the first
  `make data` after a patch is slow while files download. Not a bug.

---

## Roadmap (stage numbering)

- **Stage 0 (done)**: scaffold, parse/loc/modifier/economy libs, entity
  registry + search, Goods list + detail pages, icon extraction, deploy.
- **Stage 1**: Buildings (flagship page: PM matrix with `formatBag`), PM
  explorer, pop types/needs. Extend `economy.mjs` edges as needed.
- **Stage 2**: Laws, interest groups, ideologies, institutions, technology
  (unlocks reverse-index over the graph).
- **Stage 3**: World/diplomacy (countries, states, treaties, power blocs).
- **Stage 4**: Journal entries / decisions / events via a generic
  trigger-effect pretty-printer (readable scriptese, loc-resolved, entity-
  linked) — curate phrasing case-by-case afterwards.
- **Stage 5**: Tools (building profit calculator, tech path planner), audit
  gate (`make audit`: every modifier key used must resolve; every loc ref
  resolves; every icon exists), per-patch changelog diffing.
