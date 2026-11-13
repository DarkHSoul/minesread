# Bounded 26.3 protocol compatibility audit

Evidence source: official unobfuscated `client-26.3.jar`, SHA-256
`4508d006323f24fa02876310c192d739af56516eb259000ac50f0909a68c9a2d`.
Inspected using JDK 21 `javap -c -p`; comparison target is pinned minecraft-data
3.119.0 and minecraft-protocol 3473413d32ee09af55aa77579000391be3bb9753.
This audits the boundaries below, not every packet or component payload.

## Proven silent team options bug

`ClientboundSetPlayerTeamPacket$Parameters.<clinit>` assembles, in order:
trusted components at offsets 0, 8, 16; visibility at 24; collision at 32;
optional TeamColor at 40/43; BYTE options at 51; composite at 64.
`PlayerTeam.packOptions` sets friendly-fire bit 1 at offsets 9–13 and
see-friendly-invisibles bit 2 at 21–25. `TeamColor.<clinit>` constructs the
sixteen standard colors in black-to-white order and its ID codec at 415–426.
The pinned schema correctly represents these options as named `flags`, but
the team plugin read the absent `packet.friendlyFire` field. Team creation
and modification consequently published `Team.friendlyFire === undefined`.

`teamOptions` now converts the flags to the existing public numeric mask.
Legacy packets retain their numeric field unchanged. No dependency mutation,
codec patch, or startup ordering hook is required.

The independent protocol-777 wire fixture
`6f0178000800015808000008000000000003010170` encodes team x, add, display X,
empty prefix/suffix, always visibility/collision, absent color, options 3,
member p. The real deserializer and plugin produce numeric mask 3 and reset
color. Updates check all four option masks. Restoring the old two field reads
made this regression fail with `undefined !== 3`; the fixed suite passes.

## Numeric registry order checks

`test/common/protocolRegistry26_3.json` records names extracted from official
bytecode, independently of minecraft-data. The regression compares every ID:

| Boundary | Official method evidence | Result |
| --- | --- | --- |
| 122 slot component IDs | `DataComponents.<clinit>`, registration strings from offset 13 custom_data to 1707 cushion/color | All IDs match |
| 128 particle IDs | `ParticleTypes.<clinit>`, offset 0 angry_villager to 1456 sulfur_cube_goo | All IDs match |
| 44 entity serializer IDs | `EntityDataSerializers.<clinit>`, ordered registerSerializer calls through offset 727 | All IDs match |

Serializer 38's official field is WEATHERING_COPPER_STATE while the schema
calls it weathering_copper_golem_state; this is a local name alias, not a
numeric ID mismatch. No mapper changes were justified by these comparisons.

## Outgoing packet shape spot checks

`ServerboundUseItemPacket.<clinit>`: hand codec at 0, sequence VAR_INT at 8,
yRot FLOAT at 16, xRot FLOAT at 24, composite at 37. This matches use_item's
hand, sequence, rotation fields in the pinned schema.

`ServerboundInteractPacket.<clinit>`: target VAR_INT at 0, hand at 8,
Vec3.LP_STREAM_CODEC at 16, secondary-action BOOL at 24, composite at 37.
This matches the new use_entity shape; there is no legacy action discriminator.

`ServerboundPlayerActionPacket(FriendlyByteBuf)`: readEnum at 8, readBlockPos
at 19, readUnsignedByte at 27, readVarInt at 38. Its write method mirrors
that order at offsets 5, 14, 26, 35. The pinned block_dig schema matches;
its signed-byte declaration has identical wire bytes for legal faces 0–5.

These are schema layout checks, not a claim that every bot action has been
tested against a live server. Exhaustive component payload codec checking,
all particle payload codecs, all metadata payload codecs, and all outgoing
inventory hash paths remain outside this bounded pass.

## HolderSet payload desynchronization fixes

The official TypedDataComponent codec exporter produced this ancient_debris
damage_resistant component: `1b00116d696e6563726166743a69735f66697265`.
Pinned `SlotComponent` decoded only 2 of its 20 bytes, treating the HolderSet
discriminator zero as an empty string length. Remaining bytes would corrupt
subsequent component or packet fields. Registry ID order alone cannot detect
this payload defect.

Three string declarations demonstrably require HolderSet codecs in 26.3:

| Field | Official evidence |
| --- | --- |
| damage_resistant | `DamageResistant.<clinit>` loads DAMAGE_TYPE at 11, calls holderSet at 14, composite at 27 |
| provides_banner_patterns | `DataComponents.lambda$static$67` calls holderSet at 13 and networkSynchronized at 16 |
| blocks_attacks.bypassedBy | `BlocksAttacks.<clinit>` loads DAMAGE_TYPE at 51, calls holderSet at 54, optional operation at 57–62 |

`ByteBufCodecs.holderSet` constructs `$34`. `$34.decode` reads VarInt minus
one at 1–5, dispatches -1 to a tag Identifier at 31–35, and otherwise reads
that many holder IDs at 75–104. Its encode writes zero for a named tag at
14–16, or size+1 for direct IDs at 42–51. Existing protocol `IDSet` matches
this wire format. `patchComponentProtocol` replaces those three incorrect
declarations before codec compilation, guarded by the old schema shapes.
The application calls it for 26.3 only; older schemas are unaffected.

Regression coverage compiles independent original and patched protocols:
the actual exported bytes consume 2/20 before and 20/20 after. All three
components decode and exactly reencode named tags, explicit ID lists, and
empty lists. The patch is idempotent and tolerates absent schemas. Official
flower_banner_pattern and shield default component exports also fail full
consumption before the fix and decode/reencode exactly after it. Their named
sets are minecraft:pattern_item/flower and minecraft:bypasses_shield.

## Additional exported-default payload failures

`TeleportRandomlyConsumeEffect.<clinit>` composes FLOAT diameter at offset
11 and BOOL directionalParticles at 19, composite at 32. The pinned schema
omitted the bool. Actual chorus_fruit consumable bytes
`183fcccccd01bf050101034180000001` consumed 15/16 bytes before the fix.
The patch appends the confirmed boolean and consumes/reencodes all 16 bytes.

`SignText.<clinit>` composes four messages at 21–28, four filtered messages
with an optional operation at 38–55, dye color at 65 and glow bool at 73.
The pinned schema unconditionally expected four filtered messages.
Official oak_sign exported front and back components are respectively
`76080000080000080000080000000f00` and
`77080000080000080000080000000f00`: four empty NBT strings, absent filtered
messages, black dye ID 15, false glow. Both previously threw PartialReadError.
Wrapping filteredMessages in `option` fixes both and preserves exact bytes.

Validation: `npx mocha test/protocolCompatTest.js --reporter dot` (5 passing),
and Standard on the helper, team plugin and regression test.
