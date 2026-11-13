/* eslint-env mocha */
const assert = require('assert')
const compat = require('../lib/chunk_compat')
const { DirectPaletteContainer, SingleValueContainer, IndirectPaletteContainer } = require('prismarine-chunk/src/pc/common/PaletteContainer')
const { createSerializer, createDeserializer } = require('minecraft-protocol/src/transforms/serializer')

function setup (version) {
  const registry = require('prismarine-registry')(version)
  return compat(require('prismarine-chunk')(registry), registry)
}
function palette (bits, capacity, value, noSizePrefix) {
  if (bits === 0) return new SingleValueContainer({ value, capacity, noSizePrefix })
  const indirect = capacity === 64 ? bits <= 3 : bits <= 8
  const data = indirect
    ? new IndirectPaletteContainer({ palette: [value, 0], bitsPerValue: bits, capacity, noSizePrefix })
    : new DirectPaletteContainer({ bitsPerValue: bits, capacity, noSizePrefix })
  if (!indirect) for (let i = 0; i < capacity; i++) data.set(i, value)
  return data
}
describe('chunk compatibility', () => {
  for (const version of ['1.18.2', '1.21.4', '1.21.5', '26.3']) {
    for (const [blockBits, biomeBits] of [[0, 0], [4, 1], [8, 3], [15, 7], [17, 9]]) {
      it(`${version} load/dump/storage preserves ${blockBits}/${biomeBits}-bit palettes`, () => {
        const Chunk = setup(version)
        const source = new Chunk({ minY: -64, worldHeight: 32 })
        const modern = require('prismarine-registry')(version).version['>=']('1.21.5')
        source.sections[0].data = palette(blockBits, 4096, 1, modern)
        source.biomes[0].data = palette(biomeBits, 64, 511, modern)
        source.emptySkyLightMask.set(1, 1)
        source.emptyBlockLightMask.set(2, 1)
        const bytes = source.dump()
        const loaded = new Chunk({ minY: -64, worldHeight: 32 })
        loaded.load(bytes)
        assert.strictEqual(loaded.getBlockStateId({ x: 0, y: -64, z: 0 }), 1)
        assert.strictEqual(loaded.getBiome({ x: 0, y: -64, z: 0 }), biomeBits === 7 ? 127 : 511)
        // JSON storage must retain direct block storage, biome width and flags.
        const restored = Chunk.fromJson(loaded.toJson())
        assert.deepStrictEqual(restored.dump(), bytes)
        const masks = Chunk.fromJson(source.toJson())
        assert.strictEqual(masks.emptySkyLightMask.get(1), 1)
        assert.strictEqual(masks.emptyBlockLightMask.get(2), 1)
        const before = loaded.sections
        assert.throws(() => loaded.load(bytes.subarray(0, bytes.length - 1)))
        assert.strictEqual(loaded.sections, before)
        assert.throws(() => loaded.load(Buffer.concat([bytes, Buffer.from([0])])))
        assert.strictEqual(loaded.sections, before)
      })
    }
  }
  it('loads a real 26.3 map_chunk protocol frame with a 9-bit custom biome', () => {
    const registry = require('prismarine-registry')('26.3')
    const Chunk = require('prismarine-chunk')(registry)
    const source = new Chunk({ minY: -64, worldHeight: 16 })
    source.biomes[0].data = palette(9, 64, 511, true)
    const params = { x: -7, z: 13, heightmaps: [], chunkData: source.dump(), blockEntities: [], ...source.dumpLight() }
    const serializer = createSerializer({ state: 'play', isServer: true, version: '26.3' })
    const parser = createDeserializer({ state: 'play', isServer: false, version: '26.3' })
    const decoded = parser.parsePacketBuffer(serializer.createPacketBuffer({ name: 'map_chunk', params })).data
    assert.strictEqual(decoded.name, 'map_chunk')
    const { EventEmitter } = require('events')
    const { Vec3 } = require('vec3')
    const bot = new EventEmitter()
    Object.assign(bot, { registry, version: '26.3', _client: new EventEmitter(), supportFeature: registry.supportFeature, game: { minY: -64, height: 16 } })
    registry.biomes[511] = { id: 511, name: 'example:custom' }
    require('../lib/plugins/blocks')(bot, {})
    bot._client.emit('login', { worldState: { name: 'example:test', dimension: 0 } })
    bot._client.emit(decoded.name, decoded.params)
    const column = bot.world.getColumn(-7, 13)
    assert(column, 'blocks plugin must publish decoded map_chunk')
    assert.strictEqual(bot.world.getBlock(new Vec3(-112, -64, 208)).biome.name, 'example:custom')
    const PatchedChunk = compat(Chunk, registry)
    assert.strictEqual(PatchedChunk.fromJson(column.toJson()).getBiome({ x: 0, y: -64, z: 0 }), 511)
    assert.deepStrictEqual(PatchedChunk.fromJson(column.toJson()).dump(), params.chunkData)
  })
})
