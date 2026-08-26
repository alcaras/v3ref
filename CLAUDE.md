# CLAUDE.md — agent guide for v3reference

Sibling of [owreference](https://github.com/alcaras/owreference) (Old World), same
philosophy for Victoria 3: an Astro static site that is a **deterministic
projection of the game's own files**, re-generated each patch.

**Live:** https://alcaras.github.io/v3ref/ · **Source:** https://github.com/alcaras/v3ref

---

## The core idea

The game's script files (Paradox/Jomini format) are mirrored in a sibling
`v3ref/` folder (script + localization only, no gfx — synced from a Steam
install each patch). Build scripts parse them into `src/data/*.json`, Astro
renders those. Every fact on the site must be derivable from the game files;
generated JSON is committed so GitHub Actions only runs `astro build`.

Point the pipeline at the mirror with `V3REF` (defaults to `../v3ref`):

```
make data       node scripts/build_*.mjs → src/data/*.json (+ public/data/*.json)
                  build_map.mjs needs ImageMagick and reads provinces.png;
                  build_locations.mjs joins the 1836 history folders
make art        scripts/extract_art.sh   → DDS→PNG from a local install (VIC3_APP)
make audit      scripts/audit.mjs        → HARD GATE (see below)
make changelog  scripts/changelog.mjs    → diff vs last snapshot → CHANGELOG.md
make build      npx astro build          → dist/
```

**Per-patch flow:** sync `../v3ref` → `make art` (if icons changed) →
`make patch` (= data, audit, changelog, build) → review CHANGELOG.md →
commit and push (Actions deploys) → `make snapshot` to rebaseline the diff.

**The audit is the tripwire that makes a patch safe.** It fails the build when
(1) a modifier key we render isn't in the game's `modifier_type_definitions`
and isn't matched by `matchDynamic()` — i.e. a new patch field we'd label with
a guessed name, (2) an icon path has no file, (3) an entity link points at no
route, or (4) loc markup leaked into rendered text (warning). Never silence it
by deleting data — teach `modifiers.mjs`/`extract_art.sh` about the new thing.

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

`scripts/lib/icons.mjs` — `iconPath(texture, dir)` is the ONLY way to build an
icon path. It returns null when an entry has no texture, so pages degrade
instead of linking `img/dir/.png` (which the audit would then fail on).

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
8. **The map is one recoloured index image.** `build_map.mjs` downsamples
   `provinces.png` with ImageMagick `-sample` (NEAREST NEIGHBOUR — an
   interpolating filter invents colours matching no province) and encodes the
   state index in each pixel's R+G. Every layer, overlay and locator map
   recolours that one 111KB image client-side; never generate per-state
   images. Label anchors are the mean of a state's own pixels SNAPPED to a
   pixel in that state — a bbox centre lands in the sea for concave shapes.
9. **A choropleth is an all-pairs form**: any two regions get compared, not
   just legend neighbours, so the categorical palette caps at its three
   all-pairs-safe slots. Overlays therefore max out at three and colour by
   which layer LEADS, never by blending hues (that is what makes these maps
   muddy). One layer = sequential ramp, near-zero closest to the surface.
10. **Never scale text with a CSS transform.** Map numbers lived inside the
    zoomed layer with a counter-scaled font and turned to mush — the browser
    rasterises at the computed size then stretches. Keep labels OUTSIDE the
    transform and apply the view to their POSITION. Likewise, anything
    positioned against a transformed element (tooltips) must measure the
    untransformed wrapper.
11. **A sticky GRID ITEM is constrained by the grid container, not its row**
    (Chrome), so in a multi-row grid it slides over the row below. Put the
    sticky on an inner wrapper.

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

**Anchor every claim in the game files. Do not invent mechanisms, labels, or
numbers, and when you must supply one, make it visible.** Fabrications found
and fixed the hard way in this repo:

- Asserting a mechanism that isn't there. The profit tools claimed percentage
  goods modifiers made PM groups interact. There are **zero** `_mult` goods
  lines in the data — all 723 are flat, and "automation" works through
  *negative employment*, not multipliers. Before describing how something
  works, grep for it. `make audit` now fails if a percentage goods line ever
  appears, so the claim can't rot silently.
- Guessing at file paths. Unit "icons" were invented (`img/military/<id>.png`);
  unit art is actually culture-gated `combat_unit_image` illustrations. The
  audit's missing-icon check caught it.
- Substituting a lookalike field. `land_usage` was falling back to the group's
  `category`, which is a *different* field whose values include `development`.
  Per the building_groups docs, unspecified `land_usage` means the building
  uses **no** state resource — say that, don't approximate it.
- Inverting a field's meaning. `unemployment_wealth` was labelled "unemployed
  wealth"; the game's own comment says it is the wealth level at or below which
  pops **switch into** that profession.
- Coining terminology. "Destitution sink" was our phrase, not the game's. Use
  the game's words, or plainly describe the field.
- Hand-written label maps. Tiers, law categories, and tech categories were
  Title-Cased by hand; the game has `country_tier_*`, `POWER_STRUCTURE`, etc.,
  and spells it "City-State", not "City-state".

Mechanics for staying anchored:

- `loc.name(id, prefixes)` tries the id, the caller's known prefixes, then
  UPPERCASE. It rejects text containing `…` — an unresolved data function means
  the string is a runtime sentence (`war_goal_conquer_state` = "Conquer
  [GetTargetState.GetName]"), not a label. Anything it can't resolve is
  Title-Cased **and recorded**; the pooled list lands in
  `data/invented-labels.json` and the audit reports the count. That number is
  the size of our fiction — keep it small and know what's in it.
- Read id lists with `idList()`, never `asArray().flat()`. Paradox writes empty
  blocks as `traditions = { }`, which parses to `{}`; the naive read shipped
  literal "[object Object]" to 280 culture rows. The audit now fails on it.
- State the scope of a derived number. The profit tools price goods and jobs
  only; methods also carry mortality, shares, job attractiveness, minimum wage,
  and training-rate effects that are not priced, and 33 of 97 buildings move no
  goods at all. Say so on the page rather than implying completeness.

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
- **Not every entry has art.** Combat unit types have no flat icon (their art
  is a set of culture-gated `combat_unit_image` illustrations); `pm_dummy` has
  no texture; special character traits and leader ideologies live in
  *subfolders* of their icon dirs. Use `iconPath()` and extract the subfolder.
- **`bg_monuments_hidden`** holds 13 decorative dummies (Machu Picchu et al.)
  whose loc name resolves to a dev note — excluded from buildings/entities.
- **Warships are not `combat_unit_types`** — since the naval rework they live
  in `ship_types` with their own designer modifications.
- **Ideology count is a trap**: 172 exist, but ~135 are country-flavored/event
  variants (multiple "Carlist"s). Matrix displays use the 37 the base interest
  groups actually reference (`core: true` in ideologies.json).
- **Modifier blocks carry meta keys** (`icon`, `multiplier`) that are not
  modifiers — `formatBag` filters to numeric/boolean values only.
- **`parseFolder` merges by TOP-LEVEL key, and the history folders all use the
  same one** (`POPS`, `BUILDINGS`, `STATES`), so it silently keeps only the
  last file — 47 populated states and a 38M world. Parse those per file
  (`parseEach` in `build_locations.mjs`). The tell was the world population:
  1.022 BILLION is right for 1836, and country totals match history
  (France 34.6M, Britain 26.0M, Russia 55.9M, China 366M). Use that check.
- **218 of 675 states are SPLIT between countries**, and the setup records
  each pop under the country holding it. Attribute population per owner, not
  per state, or Portugal appears to hold 45M people instead of its 446k in
  Bombay. `locations.json` carries `owners[].population` and a `split` flag.
- **Capped resources and arable land in a split state divide by each owner's
  share of provinces** (wiki-documented, not in script). Say so where the
  whole-state figure is shown.
- **Construction cost is a property of the BUILDING**; no production method
  modifies it (checked across every PM). So ranking a building's methods by
  profit-per-construction is profit divided by a constant — same order. It
  only reorders ACROSS buildings, which is why that target lives on Compare
  Buildings.
- **A lone production method is not buildable.** A building runs one method
  from every group, so cross-building comparisons must evaluate whole
  configurations, not isolated methods.
- **Save files**: a `.v3` is a ZIP whose `gamestate` is PDX BINARY (~244MB
  unpacked) — unreadable in the browser, hence melting at pdx.tools first.
  In a melted save, current prices live at
  `<market id>={ … previous_price_report={ goods={ N={ value=X } } } }`, goods
  keyed by POSITION in `common/goods` (hence `index` on each good).
  `meta_data.name` is the played country; `country_manager…definition="TAG"`
  carries `market=N`, which is how the importer finds the player's market.
  A save holds many markets (12 in a real MP save) with different prices.

---

## Roadmap

- **Reference (done)**: every planned page — economy (goods, buildings, PMs,
  pops, needs, companies), politics (laws, IGs, ideologies, institutions,
  traits, decrees), technology, military (units, mobilization, ships),
  diplomacy (treaties, power blocs, subjects, war goals), world (countries,
  locations, cultures), journal/events/decisions, concepts, defines.
- **Locations (done)**: 675 per-state pages with the 1836 owner split, pops by
  culture and religion, starting buildings with their active methods, computed
  goods output, and a locator map cropped from the shared index image.
- **Map (done)**: layers for deposits, undiscovered finds, 1836 production and
  population; up to three overlays; numbers on the map; zoom, pan and pinch;
  ranked table + CSV. View lives in the hash (`#l=…&labels=1&z=3`).
- **Profit tools (done)**: Building Profit (one building, every method ranked
  in place, per-group locks, optimise by construction point or per worker) and
  Compare Buildings (every building at its best full configuration). Prices are
  shared via localStorage and can be imported from a melted save.
- **Infrastructure (done)**: `make audit` gate, per-patch changelog with
  gzipped snapshots, invented-label tracking.
- **Companies planning lives elsewhere**: <https://alcaras.github.io/v3co/> is
  the maintained tool (coverage matrix, seven-slot optimiser, filters). This
  site keeps the reference data and links across; do not rebuild a planner.
- **Open**: a shareable tech-tree planner (owtt-style: era columns, click a
  tech to pull in its prereq closure, nation picker seeded from the tier
  bundles in `scripted_effects/00_starting_inventions.txt` + per-country
  history files, plan in the URL hash). Deeper event trigger/effect rendering
  if the loc text proves not enough. States↔cultural-homelands join. Country
  flags (procedural coats of arms). The save importer's file-picker path is
  implemented but has never been exercised in a real browser — its parsing is
  verified against a 309MB melted save in Node, the click-to-load is not.
