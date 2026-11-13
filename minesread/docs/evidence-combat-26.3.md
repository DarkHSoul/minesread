# Combat / explosion evidence — Minecraft Java 26.3

Inspected actual Mojang named bytecode with `javap -p -c`. Client SHA1:
`e877b6a07acd633fb3bb475002175cec036e7b87`. Server is the extracted
`server-inner.jar` from the downloaded 26.3 server distribution. Focused dumps
are in the task workspace `work/minecraft-api/combat/` (not repository sources).

## Observed rules and bytecode offsets

| Class / method | Offsets | Derived behavior |
| --- | --- | --- |
| `Player.tick` | 240–257, 260–300 | Increment attack and item-swap counters each tick; reset both when main-hand item identity changes. A count/component change alone does not reset. |
| `Player.getCurrentItemAttackStrengthDelay` | 0–14 | Float cast of `20 / effective attack_speed`. |
| `Player.getAttackStrengthScale` / `getItemSwapScale` | 0–17 | Clamp `(counter + partialTick) / delay` to [0,1]. |
| `Player.resetAttackStrengthTicker` | 0–10 | Zero both counters. |
| `Player.onAttack` / `resetOnlyAttackStrengthTicker` | 0–8 / 0–5 | Server attack hook resets attack counter only; separate from client click reset. |
| `MultiPlayerGameMode.attack` | 0–28 | Ensure held item sent; send attack packet, call local Player.attack, then reset BOTH counters. |
| `AttributeInstance.calculateValue` | 0–149 | Add operation 0; operation 1 uses post-addition base; operation 2 multiplies running total. Attribute-specific sanitation follows. `Attributes.<clinit>` offsets 26–75 and 124–149 define armor [0,30], toughness [0,20], attack_speed [0,1024]; implemented clamping uses those bounds. Zero attack speed means infinite delay and zero finite-tick charge. |
| `ServerExplosion.getSeenPercent` | 0–116, 123–294 | Sample actual AABB using increments 1/(2*dimension+1), X/Z centering offsets; ray from sample to center, COLLIDER and fluid NONE, entity context. Return float visible/total. |
| `ServerExplosion.hurtEntities` | 203–357 | Radius test uses entity-position distance; delegate damage to explosion calculator. |
| `ExplosionDamageCalculator.getEntityDamageAmount` | 0–65 | Radius=2*power, impact=(1-distance/radius)*exposure; float result `(impact²+impact)/2*7*radius+1`. **No integer floor.** Completely blocked exposure still returns 1 inside radius. |
| `Player.hurtServer` | 51–107 | Only when source scalesWithDifficulty: peaceful 0; easy min(damage/2+1,damage); hard damage*3/2; normal unchanged. Nonplayers do not use this player scaling branch. |
| `CombatRules.getDamageAfterAbsorb` | 0–100 | Armor effective=clamp(armor-damage/(2+toughness/4), armor*0.2,20); multiply damage by (1-effective/25). Source weapon may modify armor effectiveness (33–83). |
| `LivingEntity.getDamageAfterMagicAbsorb` | 0–73, 166–228 | Respect damage bypass tags; resistance multiplies by max(0,(25-5*(amplifier+1))/25); equipment enchantment helper then computes protection. |
| `CombatRules.getDamageAfterMagicAbsorb` | 0–16 | Multiply by 1-clamp(resolved protection,0,20)/25. |
| `EnchantmentHelper.getDamageProtection` | 0–26 | Iterate equipped enchantments with server-level/entity/source context. Not a fixed client-side sum inferred from visible item names. |
| `LivingEntity.actuallyHurt` | 10–48 | Armor, then magic reduction; absorption is deducted afterwards, separately from reduced damage. |

## Implemented contract

`combat` must load after `entities`. It maintains a local clock on `clientTick`,
including when movement physics is disabled. It exposes `getAttackStrengthDelay`,
`getAttackStrengthScale`, `getItemSwapScale`, and `getAttackCooldownTicks`.
Missing attack-speed attributes return null rather than assuming weapon stats.
The attack wrapper preserves arguments, receiver, thrown errors and return value.
A successfully dispatched call resets both counters, matching the vanilla client;
this does not mean that the server accepted damage. Counters restart at spawn.
Server counter phase / lag cannot be recovered from protocol packets.

`getExplosionDamageEstimate(target, sourcePos, power, options)` is a conditional
single-hit calculation. `rawDamage` is before defenses; `damage` is after defenses
and before absorption; `healthDamage` is only provided with known absorption.
It is **not** hit success: invulnerability frames, blocking, immunity, creative mode,
custom server logic, special entity damage handlers and intervening world changes
are outside this calculation. JavaScript arithmetic rounds outputs to float32 but
is not advertised as bit-identical at every Java intermediate operation.

Required options: measured `exposure`, or `rayClear(sample, source, target)` returning
boolean and null for unknown world. The sampler uses supplied target width/height,
which must describe the current symmetric AABB (including pose/scale). No fixed
standing-player box. The automatic sampler supports a conservative subset: loaded air, cave_air, void_air, water, lava and full-cube block shapes, excluding pistons, powder snow and scaffolding. It uses prismarine-world RaycastIterator, detects unloaded blocks, and casts from samples toward the source. Partial shapes and other empty shapes return unknown. Generic Mineflayer raycasts cannot by themselves certify
vanilla collision-shape/entity-context semantics or loaded-world completeness,
so the automatic subset deliberately refuses other shapes. An unknown ray returns unknown.

For defense calculation provide known `armor` / `toughness` (otherwise effective
modern or legacy entity attributes), resolved `protection` (0 for none),
`resistanceAmplifier` (-1 for absent), and `standardExplosion: true`. The assertion
means ordinary vanilla explosion damage tags, no source-weapon armor modifier,
and default calculator. Player targets additionally require
`scalesWithDifficulty`; `difficulty` defaults to bot.game.difficulty.
`absorption` is optional and must be known to compute health damage. `raw: true`
returns the base calculation without requiring defenses. No automatic resistance
or enchantment resolution claims are made: tracked effects alone do not establish
source bypass tags, and data packs may alter enchantment predicates/effects.

Legacy `getExplosionDamages(target,source,power,rawDamages)` retains its arguments,
but returns null when required exposure/defenses are unknown; raw mode returns numeric damage for loaded supported collision paths. Outside radius it
returns 0. This intentionally replaces prior false certainty. Use the structured
method for supplied measurements. No reach advisory added: use root entity
interaction / LOS APIs, which carry their own uncertainty contracts.

## Validation

Targeted Mocha fixtures cover fractional attack charge, item identity versus count,
attack dispatch reset and modifier order; base damage 57, easy 29.5, hard 85.5,
peaceful 0, blocked exposure 1, nonplayer unaffected by player difficulty,
armor+toughness+resistance+protection and absorption. Additional sampler fixtures
cover dimensions and unknown rays. Standard run on changed JavaScript files.
No vanilla server started and no EULA accepted.
