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

**[unknown]** the exact arithmetic turning `combat_width` into the advantage
cap.

## 5. Rounds, morale and casualties

Structure [script, `concept_battle_desc` / `concept_morale_desc` /
`concept_casualties_desc`]:

- A battle runs in **rounds**. Each round some remaining manpower becomes
  **demoralized** for the rest of the battle and can no longer act.
- Morale is *the fraction of remaining manpower still able to fight*, not a
  separate pool.
- Casualties split into dead and wounded by the unit's **recovery rate**
  against the enemy's **kill rate**.
- The side that runs out of manpower, or hits a low-morale threshold, withdraws.
- Morale recovers after battle at `BASE_MORALE_RECOVERED_PER_DAY = 0.03`,
  scaled by formation supply.

Constants [script, `NMilitary` / `NBattle`]:

```
BATTLE_LETHALITY_MIN/MAX                    0.001 / 0.005
BATTLE_RAW_MANPOWER_INFLICTED_CASUALTY_RATIO  0.5   # casualties from numbers alone
BATTLE_COMBAT_EFFICIENCY_INFLICTED_CASUALTY_RATIO 1.5 # casualties from offense/defense
BATTLE_MAX_CASUALTY_DISADVANTAGE_PENALTY    1.0
MAX_CE_ADVANTAGE                            1
MIN_MANPOWER_CASUALTY_PER_ROUND             5
MIN_USABLE_MANPOWER                         100
CASUALTY_ROLL_MIN / MAX                     50 / 200
SURVIVAL_RATE                               0.66
ESCAPE_PROGRESS_REQUIRED_MIN                10.0
ESCAPE_PROGRESS_REQUIRED_PER_MANPOWER       0.001
ESCAPE_PROGRESS_GAIN_BASE                   1.0
ESCAPE_PROGRESS_GAIN_RANDOM_FACTOR          2.5
```

Paradox's comments are explicit that the two casualty ratios are the balance
knob: raising the raw-manpower one "makes CE less important and battles more
lethal".

`DistributeCasualtiesAmongstUnits` (battle_casualties.cpp:370–376) [exe,
`0x14118aae0`] rolls twice per call and clamps each roll to the remaining
amount on each side — consistent with `CASUALTY_ROLL_MIN/MAX` being a per-unit
chunking of an already-decided total.

**[unknown]** the equation producing that total per round, the round duration,
and how morale loss scales per round. These set absolute casualties and battle
length; they do not change which composition wins, because composition enters
only through the mean of §2.

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

- Absolute casualty counts and battle durations rest on §5 **[unknown]**. Show
  them as relative, or label them.
- Front-level behaviour (which battles happen, province capture, advance
  progress) is out of scope; this is a single-battle model.
- Naval combat is a separate system (hull damage, armour, readiness, screening)
  and shares nothing with the above but the word "battle".
