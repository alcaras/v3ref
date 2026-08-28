# Victoria 3 land battle mechanics — 1.13.11

Working dossier for the battle simulator. Every claim is tagged:

- **[script]** — read directly from the game's own files
- **[exe]** — recovered from `victoria3.exe` (see `tools/decompile/`), with the
  function address so it can be re-checked
- **[unknown]** — not yet established; anything the simulator builds on top of
  this must be labelled inferred on the page

---

## 1. The unit roster [script]

`common/combat_unit_types/00_land_combat_unit_types.txt` — 19 land types in
4 groups. Every type has `max_manpower = 1000`.

| unit | group | supply | offense | defense | morale loss | kill rate | notes |
|---|---|---|---|---|---|---|---|
| irregular_infantry | infantry | 25 | 10 | 10 | 15 | — | levies |
| line_infantry | infantry | 30 | 20 | 25 | 10 | — | levies |
| skirmish_infantry | infantry | 40 | 25 | 35 | 10 | — | |
| trench_infantry | infantry | 50 | 30 | 40 | 8 | — | |
| squad_infantry | infantry | 60 | 40 | 50 | 6 | — | |
| mechanized_infantry | infantry | 80 | 50 | 60 | 4 | — | |
| cannon_artillery | artillery | 30 | 25 | 15 | 10 | +0.10 | |
| mobile_artillery | artillery | 40 | 30 | 15 | 8 | +0.20 | |
| shrapnel_artillery | artillery | 60 | 45 | 25 | 6 | +0.30 | |
| siege_artillery | artillery | 80 | 55 | 30 | 6 | +0.25 | |
| heavy_tank | artillery | 100 | 70 | 35 | 4 | +0.25 | +15% morale damage |
| hussars | cavalry | 25 | 15 | 10 | 10 | — | |
| dragoons | cavalry | 40 | 20 | 25 | 8 | — | +30% occupation |
| cuirassiers | cavalry | 40 | 25 | 20 | 8 | — | +30% occupation |
| lancers | cavalry | 70 | 30 | 20 | 6 | +0.05 | +30% occupation |
| light_tanks | cavalry | 100 | 45 | 45 | 4 | — | +30% occupation |
| low/mid/high_tier_marines | marines | 30/45/60 | 20/25/30 | 25/35/40 | 10/10/8 | — | no naval-invasion penalty |

Each also carries `goods_input_*` upkeep, `unlocking_technologies`, and an
`upgrades` chain. Infantry and marines are `default_group`; artillery and
cavalry are **special units**, and a formation with more special than default
units takes an organization penalty (§6).

## 2. Combat effectiveness is a MEAN, not a sum [exe]

The single most important fact for composition questions.

`GetAverageOffenseExcludeUnavailableManpower` → `FUN_141af04e0` →
`FUN_140d7f160(side, out, /*stat*/0, /*excludeUnavailable*/1)`.

`FUN_140d7f160` @ `0x140d7f160`:

```
plVar7 = FUN_140d8fdb0(...)          // accumulate
sum    = plVar7[0]
count  = (int)plVar7[1]
result = count < 1 ? 0 : (sum * 100000) / (count * 100000)     // = sum / count
```

The accumulator `FUN_140d8fdb0` @ `0x140d8fdb0`, per unit:

```
usable = excludeUnavailable ? unit.usableManpower : unit[0x18]
if (usable < 1) { contribute 0; count += 0 }      // skipped from BOTH sides
else {
    stat  = FUN_140da0850(unit, …)                // resolved offense/defense
    ratio = FUN_140c9bb40(usable, total)
    contribute (ratio * stat) / 100000
    count += 1
}
```

So:

> **average offense = mean over units with usable manpower of
> (unit offense × its manpower fraction)**

Consequences that fall straight out, and that the simulator exists to quantify:

- A battalion with weak offense **dilutes** the army. Adding it is not free.
- A unit with no usable manpower leaves the average entirely — it does not
  drag the mean down, it stops counting.
- The attacking side is scored on Offense, the defending side on Defense
  (`BATTLE_OFFENSE_TOOLTIP` / `BATTLE_DEFENSE_TOOLTIP`) [script].

All values are **fixed point, scale 100000**.

## 3. Resolving one unit's offense/defense [exe]

`FUN_140da0850` @ `0x140da0850` gathers modifier keys and calls
`FUN_140da3340` @ `0x140da3340` with:

- the generic pair (`unit_offense_add` / `unit_offense_mult`)
- the army-wide pair (`unit_army_offense_add` / `unit_army_offense_mult`)
- the per-type pair, read off the unit type at `+0x138`/`+0x13a`
  (`unit_combat_unit_type_<type>_offense_add` / `_mult`)
- a conditional terrain pair, selected by `FUN_140da0640` / `FUN_140da05d0`

`FUN_140da3340` ends with

```
if (value < param_11) value = param_11;    // param_11 = _DAT_1458ff3d0
```

which is `NMilitary.MIN_OFFENSE_DEFENSE = 1` [script]. **Offense and defense
are floored at 1**, so stacking negative modifiers can never take a unit to
zero or below.

**[unknown]** the exact composition order inside `FUN_140da1960` (whether all
adds are summed before a single combined multiply, which is the site's usual
convention). Assume adds-then-mults and label it.

## 4. Terrain [script]

`common/terrain/01_terrain.txt`. Paradox's own comment on the field:

> `combat_width` — *the maximum numeric advantage a side can make use of in
> battle, 0.8 = up to 80% more of an advantage*

**Combat width is not a battalion cap.** It caps how much of a numbers edge the
bigger side can convert.

| combat_width | terrain |
|---|---|
| 1.5 | plains, ocean, all farmland, pasture, plantation, cleared_land |
| 1.0 | desert, savanna |
| 0.8 | urban, forestry, docks |
| 0.7 | tundra, snow |
| 0.6 | forest, hills |
| 0.5 | jungle, wetland, mining |
| 0.4 | mountain |

`risk` (0.1 plains → 0.6 jungle) scales casualties. Terrain also carries one or
more **labels**, and each label switches on a modifier pair
(`common/labels/00_terrain_labels.txt`):

`flat`, `elevated`, `forested`, `hazardous`, `developed`, `water` →
`unit_offense_<label>_add/mult`, `unit_defense_<label>_add/mult`.

Labels stack: mountain is `elevated` + `hazardous`; desert is `flat` +
`hazardous`; farmland is `flat` + `developed`.

`battle_combat_width_mult` and `battle_total_combat_width_mult` modify it.

Recovered in §5.2: the cap applies to the *numeric* advantage only, as
`min(excess, 1) * combat_width`.

## 5. The round [exe]

Recovered from `battle.cpp UpdateTickSerialPre` @ `0x140de97c0` and the four
casualty functions next to it. Structure and arithmetic are exact; the binding
of which side supplies which argument is read off the call site and is the one
part of this section worth re-checking.

### 5.1 Lethality — a fresh uniform draw every round

battle.cpp:986, `0x140de97c0`:

```
lethality = LETHALITY_MIN + rand01 * (LETHALITY_MAX - LETHALITY_MIN)
```

So lethality is uniform in **[0.001, 0.005]** per round. It is *not* derived
from terrain; terrain `risk` must act elsewhere.

### 5.2 Numeric advantage, and what combat width actually caps

`FUN_140dec9f0` @ `0x140dec9f0`:

```
excess = max(ourManpower / theirManpower - 1, 0)      // 0 when not ahead
```

`FUN_140decaf0` @ `0x140decaf0`:

```
advantage = min(excess, MAX_CE_ADVANTAGE) * W + uniform(-W, +W)
```

where `W` is the battle's combat width and `MAX_CE_ADVANTAGE = 1`.

This is exactly Paradox's comment on the terrain field: capping `excess` at 1
means at most a 2:1 numbers edge counts, and scaling by `W = 0.8` yields "up to
80% more of an advantage". Note the jitter term is **±W**, so on wide terrain
the round-to-round randomness is as large as the whole advantage.

### 5.3 Casualties — two halves of identical shape

`FUN_140decc00` @ `0x140decc00` (raw manpower) and `FUN_140decd80` @
`0x140decd80` (combat efficiency) reduce to the same expression:

```
casualties = (powerRatio + advantage) * lethality * targetUnits * RATIO / 1e5
```

| half | powerRatio | RATIO |
|---|---|---|
| raw manpower | manpower ratio | `BATTLE_RAW_MANPOWER_INFLICTED_CASUALTY_RATIO` = 0.5 |
| combat efficiency | `(ourUnits * ourCE) / (theirUnits * theirCE)` | `BATTLE_COMBAT_EFFICIENCY_INFLICTED_CASUALTY_RATIO` = 1.5 |

`CE` here is the **mean** of §2. Both halves return 0 when the target has fewer
than 1 unit, and each is floored at `MIN_MANPOWER_CASUALTY_PER_ROUND = 5`
(`0x1458ff4a8`). The round then sums them and caps at the manpower actually
available:

```
total = min(rawHalf + ceHalf, availableManpower)
```

Because the CE half carries 1.5 against the raw half's 0.5, **quality is
weighted 3:1 against numbers** before the width cap is applied — and the width
cap only limits the *bonus* term, never the CE ratio itself.

### 5.4 Dead versus wounded

`FUN_140ded0d0` @ `0x140ded0d0`, with the modifier ids resolved through
`tools/decompile/modifier-ids.json`:

```
woundedFraction = clamp(ownRecoveryRate - enemyKillRate, 0, 1)
```

`0x145145d68` is `unit_recovery_rate_add` and `0x145145d6c` is
`unit_kill_rate_add`. `FUN_140dec020` @ `0x140dec020` then moves that fraction
of the casualty pool from one bucket to the other, clamping both at zero.

The direction matters and is easy to get backwards: **recovery rate is the
share that merely gets wounded**, which the `NMilitary` comment on
`ATTRITION_RECOVERY_RATE_BASE` states outright — "casualties with 0.7 recovery
rate would consist of 70% wounded and 30% deaths" [script].

So artillery (`unit_kill_rate_add` +0.10 … +0.30) converts enemy wounded into
enemy dead, and field hospitals (`unit_recovery_rate_add` +0.40) convert your
own dead back into wounded. Neither changes how fast a battle is decided.

### 5.4b Morale loss — manpower going out of action

`FUN_140dec130` @ `0x140dec130`:

```
total = 0
for each unit u:
    ml     = resolve(u, unit_morale_loss_add, unit_morale_loss_mult)
    total += min(round(ml), u.manpower)          // in MEN, not percent
factor = max(1 + enemySide.unit_morale_damage_mult, 0)
return round(total * factor / 4)
```

Three things worth pulling out:

- Morale loss is counted in **manpower going out of action**, matching
  `concept_morale_desc` [script]: "some of the remaining manpower will become
  demoralized for the remainder of the battle". Morale is not a separate pool.
- It is a **sum over units**, not a mean — the opposite of offense/defense
  (§2). Each battalion brings its own `unit_morale_loss_add` (15 on irregulars
  down to 4 on mechanized), so a bigger army loses more men to demoralization
  in absolute terms, and a *better* army loses fewer per battalion.
- The **`/4` is hardcoded** — it is in no defines file. Same for the rounding,
  which is round-half-away-from-zero throughout.

That last point is the whole reason low `unit_morale_loss_add` is worth paying
for: it is the only stat that decides how long you can keep fighting, and it
does not get averaged away by the rest of the army.

### 5.5 Constants, and where they live

| define | value | storage |
|---|---|---|
| BATTLE_LETHALITY_MIN | 0.001 | `0x1458ff4e0` |
| BATTLE_LETHALITY_MAX | 0.005 | `0x1458ff4d8` |
| BATTLE_RAW_MANPOWER_INFLICTED_CASUALTY_RATIO | 0.5 | `0x1458ff4d0` |
| BATTLE_COMBAT_EFFICIENCY_INFLICTED_CASUALTY_RATIO | 1.5 | `0x1458ff4f8` |
| MAX_CE_ADVANTAGE | 1 | `0x1458ff4e8` |
| MIN_MANPOWER_CASUALTY_PER_ROUND | 5 | `0x1458ff4a8` |
| MIN_USABLE_MANPOWER | 100 | `0x1458ff49c` |
| MIN_OFFENSE_DEFENSE | 1 | `0x1458ff3d0` |
| SURVIVAL_RATE | 0.66 | `0x1458fe118` |

`tools/decompile/modifier-ids.json` maps all **427 modifier names** to their id
globals, extracted from the init function at `0x1415959c0` by pairing each
`leaq <name string>, %rax` with the `movw %ax, <global>` that follows. That map
is what turns an opaque `_DAT_145145d60` in decompiled battle code into
`unit_morale_loss_add`, and it is reusable for any other subsystem.

Storage addresses come from the registration call
`FUN_140bd9a10(_, "NMilitary", "<DEFINE>", &storage)`; finding the readers of
those addresses is how each formula above was located.

### 5.6 Still open

- **[unknown]** how terrain `risk` (0.1-0.6) enters, given lethality does not
  use it.
- **[unknown]** round duration in game time.
- `W` in §5.2 is the **post-modifier** width: `battle_combat_width_mult`
  (`0x145145de8`) has exactly one reader, `0x140deb1a0`, which populates battle
  state, and §5.2 reads `W` from a cached field on the battle object.
- **[unknown]** the withdraw threshold — the morale level at which a side
  breaks. Escape progress (below) is separate and is about getting away.

Escape [script]: progress needed is
`ESCAPE_PROGRESS_REQUIRED_MIN (10) + 0.001 per manpower`, gained per round at
`ESCAPE_PROGRESS_GAIN_BASE (1.0)` with a random factor up to 2.5.

## 6. Everything that modifies the above [script]

- **Veterancy** (5 levels): +5/10/15/25% offense and defense; +25%/+50% morale
  damage at levels 3–4.
- **Organization**: `low_organization_army` scales to −75% offense, −75%
  defense, −100% morale recovery, −0.5 recovery rate. Target organization is
  cut by exceeding command limit, by having more special than default units
  (`MILITARY_FORMATION_ORGANIZATION_SPECIAL_UNITS_ADD = -50`), by supply
  shortage below 0.25, and by exile.
- **Command limit**: 20 with no commander; general ranks add +30/+60/+80.
  Exceeding it applies `low_command_limit` (−50% organization gain).
- **Officer ratio**: below 0.75 of ideal, offense and defense scale down to
  −50% at zero officers.
- **Mobilization options** (18, in exclusive groups): e.g. machinegunners
  +5 offense/+10 defense, field hospitals +0.40 recovery rate — each with goods
  upkeep and a tech gate.
- **Battle conditions** (21): one per side, re-rolled every
  `BATTLE_CONDITION_MIN_TICKS_BETWEEN_UPDATE_DEFAULT = 40` ticks with a 1% per
  extra tick chance. Weights are scripted values keyed off commander traits
  (`character_battle_condition_<x>_mult`). Effects are mostly
  `unit_morale_loss_mult`, then `battle_casualties_mult`, `unit_offense_mult`,
  `unit_defense_mult`.
- **Commander traits**: offense/defense/morale multipliers and battle-condition
  weight multipliers.
- **Technology**: `20_military.txt` carries `unit_army_offense_mult`,
  `unit_army_defense_mult/add`, `unit_kill_rate_add`, `unit_morale_loss_mult`
  and per-type offense adds.

## 7. What the simulator must not claim

- Casualty counts per round are now exact (§5.3), but **battle length is not**:
  round duration and the withdraw threshold are still unknown, so total
  casualties over a whole battle remain inferred. Label them.
- Morale loss per round is exact (§5.4b), but the **withdraw threshold** is
  not, so "who breaks first" is derived while "when" is not.
- Front-level behaviour (which battles happen, province capture, advance
  progress) is out of scope; this is a single-battle model.
- Naval combat is a separate system (hull damage, armour, readiness, screening)
  and shares nothing with the above but the word "battle".
