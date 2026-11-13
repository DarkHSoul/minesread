# 26.3 entity observation evidence

Evidence is static `javap -p -c` inspection of Mojang's official unobfuscated 26.3 client JAR, SHA-1 `e877b6a07acd633fb3bb475002175cec036e7b87`, protocol 777. This document does not claim a live vanilla test. Unit tests use the installed 26.3 minecraft-data registry and EventEmitter fixtures.

## Named observations

`getEntityMetadata(entityOrId)` copies currently received metadata into names from `registry.entitiesByName[entity.name].metadataKeys`. Raw `entity.metadata` remains unchanged, including unnamed entries. Absent metadata stays absent: the API does not fill vanilla defaults or infer false from missing packets. `getEntityState` creates a fresh snapshot; `entityStateUpdate(entity, state, previous)` fires after `entitySpawn` and `entityUpdate` (including an update with identical values). The previous snapshot is undefined on first observation or after lifecycle reset. Health and pose remain the received scalar values, not a guessed maximum or pose name.

| Observation | Owning method and bytecode rule |
| --- | --- |
| health / pose | Registry keys `health` / `pose`; the API exposes received values without interpretation. |
| sharedFlags / onFire | `Entity.isOnFire` 37–46 reads shared flag bit 0 on client; `Entity.getSharedFlag` reads the shared byte and applies `1 << bit`. `onFire` in this API is specifically the received shared burning flag, not server remainingFireTicks or fire immunity. |
| shiftKeyDown | `Entity.isShiftKeyDown` 0–5 reads bit 1. This is distinct from pose-based crouching. |
| sprinting / swimming | `Entity.isSprinting` 0–5 reads bit 3; `isSwimming` 0–5 reads bit 4. |
| invisible / glowing / fallFlying | `Entity.isInvisible` 0–5 reads bit 5; `isCurrentlyGlowing` client branch 10–16 reads bit 6; `isFallFlying` reads bit 7. |
| frozen / fullyFrozen | `Entity.getTicksFrozen` reads synchronized ticks; API `frozen` means positive observed ticks. `Entity.isFullyFrozen` 0–16 compares ticks to `getTicksRequiredToFreeze`; base `getTicksRequiredToFreeze` 0–3 returns 140. |
| creeper.swellDirection | `Creeper.getSwellDir` 0–16 reads `DATA_SWELL_DIR`. |
| creeper.powered / ignited | `Creeper.isPowered` / `isIgnited` 0–16 read their Boolean data accessors. `getSwelling` 0–22 uses local oldSwell/swell/maxSwell, so there is deliberately no remaining-fuse field. |
| blaze.charged | `Blaze.isCharged` 0–26 reads `DATA_FLAGS_ID & 1`. `Blaze.isOnFire` delegates to this charged state, so the separately exposed shared burning flag is not claimed to equal that override. |
| enderman.creepy / staredAt | `Enderman.isCreepy` / `hasBeenStaredAt` 0–16 read `DATA_CREEPY` / `DATA_STARED_AT`. Neither exposes target UUID or exact mob intent. |
| dragonPhase | `EnderDragonPhase.<clinit>` creates phases sequentially at offsets 7–114: HoldingPattern, StrafePlayer, LandingApproach, Landing, Takeoff, SittingFlaming, SittingScanning, SittingAttacking, ChargingPlayer, Dying, Hover. `create` 0–33 assigns the prior array length as ID. Unknown received IDs retain their ID with undefined name. |

Semantic masks and dragon geometry are enabled only for 26.3; other registries can still supply named metadata. Missing entities return undefined state/metadata/phase and an empty part list.

## Dragon multipart identity and geometry

`EnderDragon.<init>` 65–199 constructs head 1×1, neck 3×3, body 5×3, tail1/2/3 each 2×2, wing1/2 each 4×2. Its subEntities array 199–263 orders head, neck, body, three tails, two wings. Actual vanilla names repeat `tail` and `wing`; `partIndex` disambiguates them. `recreateFromPacket` 18–29 assigns `packet.id + index + 1`. Parts have a stable parent reference and are stored in `bot.entityParts: Map<parentId, parts[]>`, never in `bot.entities`. The identity and dimensions are JAR-derived, not approximations.

`EnderDragon.aiStep` records Y/yaw in flight history at 411–423. `DragonFlightHistory.<init>` allocates 64 slots and head -1; `record` 11–24 fills all slots on the first record, 27–58 increments/wraps the head; `get` 0–14 indexes `(head-offset)&63`.

`aiStep` 1080–1128 obtains tilt `(history[5].y-history[10].y)*10 degrees`. Body offsets 1156–1177 are `(sin(yaw)*0.5, 0, -cos(yaw)*0.5)`; wing offsets 1180–1227 are `(±cos(yaw)*4.5, 2, ±sin(yaw)*4.5)`. Head and neck 1440–1521 use lengths 6.5/5.5, tilt and head Y offset. `getHeadYOffset` 0–18 returns -1 for sitting phases, otherwise 19–47 returns `history[5].y-history[0].y`. The sitting phases are 5/6/7. Tail loop 1534–1720 uses history samples 12,14,16 and yaw differences wrapped to ±180 degrees; formulas are transcribed in `lib/dragon_parts.js`. `tickPart` 0–24 adds the parent position to offsets.

### Explicit reconstruction limits

The API samples the observed parent on `clientTick` and refreshes transforms on movement/metadata. It does not duplicate vanilla's complete remote entity interpolation or server AI. Head/neck transforms in `aiStep` 1394–1437 additionally subtract `yRotA * 0.01` from yaw; `yRotA` evolves in server flight AI (809–843) and is not synchronized metadata. The helper uses zero for this unobserved turn correction. There is no protocol part-position packet to read instead.

Consequently **every initialized part remains `confidence: 'approximate'`**, including after history fills. `initialized` only means finite coordinates and yaw permit reconstruction. `historyComplete` means at least 17 observed samples cover the largest history offset; it does not certify matching vanilla client/server ticks. Numeric differences also arise from JS trigonometry versus vanilla float arithmetic. Callers must inspect confidence before relying on a hit or building attack policy. This is useful estimated multipart geometry with exact network IDs/dimensions, not guaranteed server-authoritative hitboxes.

Despawn, parent ID replacement, login, world-changing respawn, start_configuration and end clear tracked parts or invalidate retained references. Missing/non-finite coordinates or yaw leave parts uninitialized with null positions. Teardown prevents resurrecting a despawned entity through a retained object reference.

## Verification

`test/entityObservationTest.js` checks unknown versus false, raw preservation, incremental snapshots, named phase IDs, received shared flags/freezing and graceful unsupported-version behavior. `test/dragonPartsTest.js` checks dimensions/IDs/parent identity, sitting and yaw transforms, phase refresh, history wrap/coverage, teardown and invalid geometry. These are deterministic local tests, not live vanilla validation. Run:

```sh
npx standard lib/entity_observation.js lib/dragon_parts.js lib/plugins/entity_observation.js test/entityObservationTest.js test/dragonPartsTest.js
npx mocha test/entityObservationTest.js test/dragonPartsTest.js
```

Same-world respawn retains the ClientLevel and its dragon parts: ClientPacketListener.handleRespawn offsets 47�76 skip recreation, while 79�201 construct a new level for a different dimension key. The observation plugin tracks worldState.name and preserves existing parts/history on same-world respawn.
