# Chunk palette compatibility: official 26.3 evidence

## Scope and provenance

Read-only `javap -c -p` inspection of the official extracted server JAR supplied
by the audit workspace (`server-inner.jar`), SHA-256
`a362163eec5d1612d520772bc16e5b39c09e3b234fdc045f56bf544284ee8ae6`.
No decompiler output is vendored. Bytecode offsets below are method-local,
reproducible with the JDK `javap` command and the named fully qualified classes.

## Owning Java behavior

- `net.minecraft.world.level.chunk.LevelChunkSection.read(FriendlyByteBuf)`:
  offsets 0–13 read non-empty block count and fluid count as two shorts;
  16–21 read states; 24–41 recreate, read and publish biomes. `write` 0–36
  writes the same sequence. `readBiomes` 0–17 reads before publishing biomes.
- `net.minecraft.world.level.chunk.Strategy` constructor 21–31 obtains
  `IdMap.size()`, then `minimumBitsRequiredForDistinctValues`; that method
  0–4 calls `Mth.ceillog2`. `createForBlockStates` 0–9 uses four bits per axis
  (4096 entries); `createForBiomes` 0–9 uses two (64 entries).
- `Strategy$1.getConfigurationForBitCount`: switch at 1; zero selects single
  (52), widths 1–4 select four-bit local (58), 5–8 local (64–82), default
  constructs `Configuration$Global(globalPaletteBitsInMemory, wireBits)` at
  88–97. `Strategy$2`: zero single (32), 1–3 local (38–50), default global
  with registry memory width and supplied storage width (56–65). Consequently
  hard-coded maximum biome width 8 and block width 16 are not Java limits.
- `PalettedContainer.read`: 4–15 reads width and selects configuration;
  19–31 reads palette against strategy registry; 36–49 reads a fixed-size
  long array into storage; 50–52 publishes the result. `PalettedContainer$Data.write`
  0–13 writes storage width, 14–20 palette, 25–35 fixed-size raw long array.
  Modern palettes carry no VarInt long-array count.
- `net.minecraft.util.SimpleBitStorage(int,int,long[])`: 4–10 permits widths
  1–32; 32–38 computes floor(64/bits) values per long. The adapter uses the
  same non-spanning packing; its JS dependency is limited to 31-bit values.

## Confirmed pinned dependency failures and repair

A fresh process using the unpatched pinned dependency produces
`Bits per biome is too big: 9` for initial `Chunk.load` of a 9-bit biome
section. `chunk_biomes` previously bypassed this separately. Both paths now
share the same validated decoder in `lib/chunk_compat.js`. Direct palettes
use packet width, preserving custom ID 511 even if the column was allocated
before session registry changes. Local block widths 1–3 normalize to 4 as
Java does. Single, indirect and direct modes retain format/version flags.

The dependency also silently restores direct block JSON as zero: the direct
constructor ignores the `data` option. The durable palette JSON adapter now
restores actual BitArray storage for both blocks and biomes and serializes
`noSizePrefix` for every palette mode. The column adapter supplies the
version-derived flag for old stored JSON and corrects swapped empty sky/block
light masks. These are storage fixes established from dependency source and
round-trip regressions, not claims about Mojang's disk NBT format.

`Chunk.load` publishes both section arrays only after all sections validate.
Short data, invalid palette indexes/counts and trailing bytes reject without
partially replacing a live column. Older prefix-bearing formats remain
version-gated; pre-1.18 chunk implementations are untouched.

## Validation and limits

`npx mocha --require ./index.js test/chunkCompatTest.js test/biomeProtocolTest.js test/biomePersistenceTest.js --reporter dot`
passes 35 tests. New coverage exercises 1.18.2, 1.21.4, 1.21.5 and 26.3;
0/0, 4/1, 8/3, 15/7 and 17/9 block/biome widths; dump/load/JSON/dump;
truncation/trailing-data atomicity; distinct empty light masks. A real
minecraft-protocol 26.3 `map_chunk` frame is serialized and parsed before
the actual blocks plugin map_chunk listener following login; its installed
`Chunk.load`, light loading, world lookup and JSON reload assert ID 511. Existing biome
protocol tests cover custom-registry ID resolution and malformed local indexes.
Targeted JavaScript Standard checks pass.

This does not establish live server coverage of every registry size, disk
Anvil/NBT codecs, arbitrary custom block definitions, or 32-bit palette IDs.
The 17-bit block fixture tests width handling using a valid low block ID;
it does not claim a vanilla 26.3 registry needs 17 bits. The packet test
exercises protocol serialization and initial chunk loading, not a socket login.
