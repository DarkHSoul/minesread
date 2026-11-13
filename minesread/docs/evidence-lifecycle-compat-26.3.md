# 26.3 configuration and world lifecycle audit

Reference: official client JAR SHA-256 `4508d006323f24fa02876310c192d739af56516eb259000ac50f0909a68c9a2d`. Named bytecode was inspected using `javap -c -p`; this is static evidence, not a live proxy session.

## Findings

- `ClientPacketListener.handleRespawn` offsets 17–58 compares the dimension **world key**, not the dimension-type holder (read separately at 22–26). A new `ClientLevel` is created at 137–194 when the key differs; same-world respawn retains it. `blocks.js` compared dimension type IDs, retaining old chunks for two worlds sharing a type. It now compares world names. Other-world entities are retired; same-world entities remain.
- The same method checks `hasContainerOpen` at 214 and closes the old player's menu before replacing the player. Pending menu clicks now reject on respawn/login/configuration; a session epoch also prevents queued clicks from executing against a new session that reuses inventory window ID 0. Cursor and window caches are invalidated without sending a play-state close packet during configuration.
- `ClientPacketListener.handleConfigurationStart` creates a new `ClientConfigurationPacketListenerImpl` and switches packet protocols. Exposed dynamic dimension/biome/chat registries are cleared until replacement configuration packets arrive. Old chunks/entities are not exposed in configuration. Physics already gates play-state writes and cancels delayed teleport replies; that existing behavior is retained.
- `ClientPacketListener.notifyPlayerLoaded` constructs `ServerboundPlayerLoadedPacket` at 11–15 after the level-loading tracker is ready. The existing Minesread health-driven readiness approximation was registered only once, so a second login after configuration failed to send readiness. It now rearms per login, without repeating for subsequent health updates. This does not claim to reproduce vanilla's graphical loading readiness timing.
- World storage must not delay the in-memory world switch. The pinned `prismarine-world` `waitSaving` awaits asynchronous storage; reusing the same world would accept new chunks into old storage and clear them when the await returns. Modern worlds now replace the world synchronously, detach old forwarding, and drain old storage independently. Registry/object ownership remains local to the bot.

## Verification and limits

`test/lifecycleCompatTest.js` reproduces the old world-name mismatch, delayed-storage overlap, stale entities, pending menu click/configuration race, retained registries, and missing readiness on a second login. It uses actual plugins and World storage; registry replacement includes a real protocol-777 configuration packet roundtrip. Old/new columns sharing coordinates retain separate storage ownership.

The existing 26.3 internal network suite remains the broader regression gate. This audit does not establish complete proxy compatibility, every custom registry/datapack combination, or live server behavior. Registry replacement testing covers dimension data and invalidation of exposed biome mappings; unimplemented registry types are not invented.
