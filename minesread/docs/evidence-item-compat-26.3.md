# 26.3 item component compatibility evidence

Artifact: official Mojang client 26.3 JAR, SHA-1 `e877b6a07acd633fb3bb475002175cec036e7b87`, protocol 777. Findings use named bytecode (`javap -c -p`) and actual component bytes emitted by the JAR. No server was launched and no EULA was accepted. No live multiplayer claim is made.

## Verified contracts and changes

- `PatchedDataComponentMap.get` offsets 0–12 delegates to `DataComponentPatch.getFromPatchAndPrototype`: the item defaults/prototype are part of effective state. prismarine-item exposes the wire patch only. `lib/item_components.js` resolves explicit removals, then patch additions, then the exact-version default table. Its `{ known, present, value? }` result distinguishes an unavailable default from absence. Default complex values are cloned for each resolution so callers cannot mutate shared defaults across stacks or bots; explicit patch values reference the supplied item, as its existing component API does. Other versions retain patch handling without receiving 26.3 defaults.
- `ItemCost.test` offsets 0–27 tests item identity and `DataComponentExactPredicate.test` against the effective stack. Merchant preflight previously rejected e.g. a pristine diamond sword with a `damage=0` predicate, because the packet patch omits the default damage. `villager.js` now resolves effective components for exact predicates and effective max stack size for price clamping.
- `ItemInstance.getMaxStackSize` offsets 0–19 reads MAX_STACK_SIZE with fallback 1. `ItemStack.getMaxDamage` 0–17 reads MAX_DAMAGE with fallback 0; `getDamageValue` 0–25 reads DAMAGE with fallback 0 then clamps to [0,maxDamage]. Helpers implement those contracts. The inventory plugin exposes patch-aware bot getters and uses effective stack size and edible/consumable components. Raw prismarine-item fields are not rewritten.
- Cooldown groups now use the same resolver, preserving explicit removal and patched custom groups. Vanilla ender pearl default `use_cooldown` is 1 second with no custom group.
- The generated table uncovered actual dependency codec drift: damage_resistant, blocks_attacks.bypassedBy, and provides_banner_patterns are HolderSets; sign text filtered messages are optional; teleport_randomly has a final directionalParticles boolean. The separate protocol compatibility helper repairs those before parser creation. Default export then had **zero decoder/schema failures**.

## Reproducible factual data extraction

`minesread/scripts/ExportComponents.java` is a small original registry/codec driver, not copied game implementation. Java 25 calls `SharedConstants.tryDetectVersion`, `Bootstrap.bootStrap`, `VanillaRegistries.createWorldLookup`, builds/applies `BuiltInRegistries.DATA_COMPONENT_INITIALIZERS`, and serializes each item default using `TypedDataComponent.STREAM_CODEC`. `TypedDataComponent$1.encodeCap` offsets 0–32 writes its registered type followed by that type's stream codec. The Node generator decodes each value with the installed 26.3 `SlotComponent` codec and rejects partial reads. Dictionary/reference sorting makes regenerated data independent of JVM component iteration order.

With `$artifact` pointing to a work directory containing `client-26.3.jar`, place libraries from the official bundled server JAR's `META-INF/libraries/**/*.jar` into `$artifact/report-libraries`. Run from the repository root, using Java 25 (the tested executable was PrismLauncher's `java-runtime-epsilon/bin/java.exe`):

```powershell
& $java25 -cp "$artifact/client-26.3.jar;$artifact/report-libraries/*" minesread/scripts/ExportComponents.java "$artifact/default-components-wire.tsv"
node minesread/scripts/generate-item-components.js $artifact
```

The Node script always writes to repository `lib/data/item_components_26_3.json`, irrespective of current working directory. It includes version, protocol, and artifact digest. The authoritative JSON report can independently be generated with the same classpath and `net.minecraft.data.Main --reports --output "$artifact/generated-reports"`; report JSON values are intentionally not mistaken for wire-shaped values.

Result: 1658 item defaults, 3826 deduplicated wire component values. 88 items have at least one explicitly unknown value, all due to the export buffer lacking dynamic registries, not decoder errors. Unknown component occurrence counts: provides_trim_material 11; block_transformer 21; chicken/variant 3; damage_type 7; jukebox_playable 22; instrument 1; provides_pottery_pattern 23. Explicit stack patches for those components still resolve. Matching an unavailable default conservatively fails instead of fabricating a value. Runtime registry updates/datapacks may replace item defaults; this snapshot is vanilla 26.3 and does not claim to implement arbitrary server-side default component synchronization.

## Verification

`test/itemComponentsCompatTest.js` uses the real 26.3 slot serializer/parser for ordinary stacks, same-id damage patches/removals, effective stack sizes and food/cooldown defaults. An actual `bot.trade` regression verifies default damage predicates pass merchant preflight and explicitly removed damage fails it. An actual `bot.consume` regression verifies full-food ordinary bread rejection, patched always-edible bread activation/completion, and removed consumable rejection; public effective durability clamps are checked. Legacy 1.20.5 fallback is covered.

Command: `npx mocha --require ./index.js test/itemComponentsCompatTest.js test/uiTradeTest.js test/cooldownProtocolTest.js --reporter dot` — 28 passing at this change. No live vanilla trade, consumption, or durability test was performed.
