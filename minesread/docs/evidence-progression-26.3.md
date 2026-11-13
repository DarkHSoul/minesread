# Server recipes and advancements: Minecraft 26.3 evidence

Scope: client protocol 777, Mojang client JAR SHA1 `e877b6a07acd633fb3bb475002175cec036e7b87`. Source artifact: `C:\Users\zeytu\Documents\Codex\2026-11-13\mi\work\minecraft-api\client-26.3.jar`. Evidence inspected with `javap -p -c -classpath <jar> <class>` (and `-v` for bootstrap method targets). No server was started and no EULA was accepted. These are wire fixtures and static client evidence, not a live gameplay claim.

## Recipe observations

`net.minecraft.client.multiplayer.ClientPacketListener`:

- `handleUpdateRecipes`: bytecode 12–28 constructs a **new** `ClientRecipeContainer` from packet `itemSets()` (18) and `stonecutterRecipes()` (22), then replaces `recipes`. These are property sets, not named crafting recipe definitions.
- `handleRecipeBookAdd`: 23–31 checks `replace()` and invokes book `clear()`. Loop 64–70 adds `Entry.contents()`. 73–90 checks `highlight()` and adds the display ID to highlights. 93–119 checks `notification()` and sends that display to the recipe toast. 125–127 refreshes the book.
- `handleRecipeBookRemove`: 23–56 iterates packet display IDs and invokes book `remove(id)`; 62–64 refreshes the book.
- `handleRecipeBookSettings`: 23 onward applies packet settings to the player's book.

`net.minecraft.client.ClientRecipeBook`:

- Fields `known` are `Map<RecipeDisplayId, RecipeDisplayEntry>`, `highlight` is `Set<RecipeDisplayId>`.
- `add`: 0–9 uses `known.put(entry.id(), entry)` (overwrite).
- `remove`: 0–9 removes from `known`; 11–16 also removes highlight.
- `clear`: 0–4 clears `known`, 9–13 clears highlights.
- `add` does not clear an existing highlight. The plugin consequently retains highlights across an overwrite without a new highlight flag.

`net.minecraft.client.multiplayer.ClientRecipeContainer` constructor 4–11 retains item sets and stonecutter recipes; `propertySet` 0–8 returns the mapped set or `RecipePropertySet.EMPTY`; `stonecutterRecipes` 0–4 returns its stored single-input set.

Matching pinned schema: `node_modules/minecraft-data/minecraft-data/data/pc/26.3/proto.yml`, `play.toClient.types`:

- `packet_recipe_book_add` (2748): entries contain numeric `recipe.displayId`, full `RecipeDisplay`, group, registry category, optional ID-set crafting requirements, notification/highlight flags; trailing `replace` boolean.
- `packet_recipe_book_remove` (2777): numeric `recipeIds` array.
- `packet_recipe_book_settings` (2783): crafting/furnace/blast/smoker open/filtering settings.
- `packet_declare_recipes` (3189): `recipes` is name + item-ID arrays, followed by `stoneCutterRecipes` input ID-set and slot display.
- `RecipeDisplay` (2091) and recursive `SlotDisplay` (2057) carry display variants, including shaped/shapeless, furnace, stonecutter and smithing. The plugin preserves the parsed entry unchanged; no conversion to the static `Recipe` class.

## Advancement observations

`net.minecraft.client.multiplayer.ClientPacketListener.handleUpdateAdvancementsPacket` 12–17 delegates to `ClientAdvancements.update`.

`net.minecraft.client.multiplayer.ClientAdvancements.update`:

- 0–20: reset clears both tree and progress; 23–34 notifies cleared listener.
- 39–47: removes packet IDs, 50–66 adds packet definitions; 69–129 applies positioned advancement x/y.
- 132–182 iterates only the packet progress mapping and looks up its tree node.
- 184–224: for known definitions, updates the received progress object's requirements and **puts that whole progress object** in the map. A packet is incremental across advancement IDs, not a merge of criteria into an existing advancement progress object.
- 230–242: completion notifications are suppressed during reset. 284–338 additionally gate toasts on packet `showAdvancements` and definition display `showToast`.
- Missing definitions are logged/ignored by the vanilla tree UI. The API deliberately retains such raw data but reports completion unknown (see inference below).

`net.minecraft.advancements.AdvancementProgress.update`: 0–25 removes criterion entries not in requirement names; 26–71 inserts missing criteria as new incomplete `CriterionProgress`; 75–77 stores requirements. `isDone` 0–10 delegates to requirements `test`.

`net.minecraft.advancements.AdvancementRequirements.test`: 0–13 returns false for an empty outer requirement list; 14–53 requires `anyMatch` in **each** group; 56 returns true. Thus groups are ANDed, criterion alternatives within each group are ORed. Unknown or absent timestamp is not obtained. An empty inner group cannot complete.

`net.minecraft.advancements.AdvancementTree.remove(AdvancementNode)`: 0–34 recursively removes children; 51–62 removes the node from the ID map. Removing a root therefore also removes descendant definitions. The API also evicts descendant progress so queries cannot expose stale completion after removal.

`net.minecraft.advancements.CriterionProgress.isDone`: 0–12 tests obtained Instant non-null. Its static initializer 0–28 maps optional `ByteBufCodecs.INSTANT`. `ByteBufCodecs` static initializer 328–346 maps LONG to INSTANT, bootstrap methods 29/30 (`javap -v`) target `Instant.ofEpochMilli(long)` and `Instant.toEpochMilli()`. Timestamps are **signed i64 epoch milliseconds**, not seconds or ticks. They remain the parser's original `SignedBigInt` array (a two-number tuple with exact `toString()`), avoiding a lossy Number conversion.

Matching schema: same file, `packet_advancements` (3100): reset; positioned `advancementMapping` with optional parent/display, requirement groups and telemetry flag; removed `identifiers`; `progressMapping` values have criterionIdentifier + optional i64 criterionProgress; showAdvancements. Actual pinned spelling `sendsTelemtryData` is retained in raw definitions.

## API and event contract

`server_recipes` exposes:

- `serverRecipes.displays`: Map keyed by numeric display ID, values are full raw book entries (including flags); `highlighted`: Set of display IDs. These IDs are not resource recipe IDs.
- `serverRecipes.properties`: Map from property-set resource name to item IDs; `stonecutterRecipes`: full raw single-input displays. `received` means a modern property/stonecutter snapshot (`declare_recipes`) has arrived, specifically; book-only reception does not set it. Before receipt, empty is unknown rather than proof the server has no recipes.
- `bookSettings`: null until received, otherwise full parsed settings packet.
- `getServerRecipe(displayId)` returns raw entry or null; `getServerRecipes()` returns an array snapshot of current values. Values are shared raw objects; consumers should treat them as read-only.
- `serverRecipeAdded(entry)` fires for every added/overwritten entry; `serverRecipeNotification(entry)` only on its notification flag; `serverRecipeRemoved(id, entry)` only for previously cached removed IDs. `serverRecipesUpdated(packet)` follows each book add/remove/property replacement, including empty replacements. `recipeBookSettings(packet)` follows settings updates. A book replacement clears previous entries without synthetic per-entry removal events. Inspect updated snapshot after the aggregate event.

`advancements` exposes:

- `advancements`: Map keyed by server resource ID; each state is `{ id, definition, progress, completed }`. Definition is full raw mapping entry (including x/y); progress is full raw criterion list; either can be null. All raw fields and timestamp representations are retained.
- `getAdvancement(id)` returns state or null; `getAdvancements()` returns current values; `isAdvancementDone(id)` returns true, false, or null when unknown. Null applies when definition, progress, requirements or parent chain are missing (including cycles).
- `advancementUpdate(state, previousCompleted)` fires for each touched ID and for completion changes resulting from a newly known parent. `advancementCompleted(state)` fires only on transition from false/unknown to true and is suppressed on reset. It expresses cached completion, not a vanilla toast; `showAdvancements` and display show_toast remain available in raw packet/definition for a UI to apply independently.
- `advancementRemoved(id, previousState)` fires for cached removed IDs, including descendants. `advancementsReset()` fires after reset/lifecycle clear. `advancementsUpdated(packet)` follows packet processing. Update state values are shared objects; consumers needing history must take their own snapshot.

Both caches clear on bot login/end and client start_configuration and remain through an ordinary dimension respawn. Lifecycle clear is conservative session invalidation, not a received empty server snapshot. Advancement reset emits its reset event; recipe lifecycle clear does not fabricate a server packet event. Unsupported legacy recipe formats are ignored; advancement fields missing from legacy shapes remain unknown without throwing. No existing `recipesFor`, `recipesAll`, `craft` implementation is changed.

## Inferences, limitations and verification

Preserving unknown progress/definitions while withholding a completion answer is an API choice beyond vanilla's UI behavior. Re-evaluating when a parent arrives provides a useful conservative observation cache. Discarding removed descendants' progress avoids stale answers although the vanilla UI's progress map can retain inaccessible holders. Completion state alone does not establish Dragon progression or imply that every advancement is required.

The transmitted display/property data does not prove arbitrary custom crafting predicates, ingredient/component consumption rules, or all server recipe resource IDs. Static recipes remain available for existing crafting callers but are not claimed to match every custom server. No placeRecipe helper was introduced, and no outbound packets are sent by either plugin.

Verified with `npx mocha test/serverRecipesTest.js test/advancementsTest.js` (10 passing) and `npx standard lib/plugins/server_recipes.js lib/plugins/advancements.js test/serverRecipesTest.js test/advancementsTest.js`. Fixtures pass actual 26.3 serializer/parser buffers through plugin packet listeners: full display preservation, flags/requirements/IDs, property and book replacement, settings, add/remove, AND/OR groups, epoch-ms precision, per-ID incremental updates and whole-progress replacement, missing data, descendant deletion, reset, lifecycle and legacy unknown behavior. Live server and arbitrary custom recipe behavior remain unverified.
