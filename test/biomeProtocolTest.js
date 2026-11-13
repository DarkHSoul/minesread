/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')
const { SmartBuffer } = require('smart-buffer')
const registry = require('prismarine-registry')('26.3')
const Chunk = require('prismarine-chunk')(registry)
const World = require('prismarine-world')(registry)
const BiomeSection = require('prismarine-chunk/src/pc/common/PaletteBiome')
const { DirectPaletteContainer } = require('prismarine-chunk/src/pc/common/PaletteContainer')
const { createSerializer, createDeserializer } = require('minecraft-protocol/src/transforms/serializer')

function setup (minY, height) {
  const bot = new EventEmitter()
  bot._client = new EventEmitter()
  bot.registry = registry
  bot.supportFeature = registry.supportFeature
  bot.game = { minY, height }
  bot.world = new World().sync
  require('../lib/plugins/blocks')(bot, {})
  const column = new Chunk({ minY, worldHeight: height })
  bot.world.setColumn(-7, 13, column)
  return { bot, column }
}
function encode (column) {
  const writer = new SmartBuffer()
  for (const section of column.biomes) section.write(writer)
  return writer.toBuffer()
}
function roundtrip (data) {
  const serializer = createSerializer({ state: 'play', isServer: true, version: '26.3' })
  const parser = createDeserializer({ state: 'play', isServer: false, version: '26.3' })
  const packet = { name: 'chunk_biomes', params: { biomes: [{ position: { x: -7, z: 13 }, data }] } }
  return parser.parsePacketBuffer(serializer.createPacketBuffer(packet)).data
}

describe('26.3 chunk_biomes protocol', () => {
  for (const [minY, height] of [[-64, 384], [0, 256]]) {
    for (const mode of ['single', 'indirect', 'direct', 'custom direct']) {
      it(`roundtrips ${mode} palettes at ${minY}/${height} through protocol 777`, async () => {
        const { bot, column } = setup(minY, height)
        const update = new Chunk({ minY, worldHeight: height })
        const biomeId = mode === 'custom direct' ? 511 : registry.biomesByName.desert.id
        if (mode === 'single') {
          update.biomes[0] = new BiomeSection({ singleValue: biomeId, noSizePrefix: true })
        } else if (mode.includes('direct')) {
          const container = new DirectPaletteContainer({ bitsPerValue: mode === 'custom direct' ? 9 : 7, capacity: 64, noSizePrefix: true })
          for (let i = 0; i < 64; i++) container.set(i, biomeId)
          update.biomes[0].data = container
        } else {
          for (let y = minY; y < minY + 16; y += 4) {
            for (let z = 0; z < 16; z += 4) {
              for (let x = 0; x < 16; x += 4) update.setBiome(new Vec3(x, y, z), biomeId)
            }
          }
          if (mode === 'indirect') update.setBiome(new Vec3(4, minY, 0), registry.biomesByName.plains.id)
        }
        bot.registry = { ...registry, biomes: { ...registry.biomes, [biomeId]: { id: biomeId, name: 'example:session_biome' } } }
        const local = new Vec3(0, minY, 0)
        const pos = new Vec3(-112, minY, 208)
        column.setBlockStateId(local, registry.blocksByName.stone.minStateId)
        column.setBlockLight(local, 8)
        column.setSkyLight(local, 12)
        const sections = column.sections
        const blockLight = column.blockLightSections
        const skyLight = column.skyLightSections
        const packet = roundtrip(encode(update))
        assert.strictEqual(packet.name, 'chunk_biomes')
        bot._client.emit(packet.name, packet.params)
        assert.strictEqual(bot.blockAt(pos).biome.name, 'example:session_biome')
        assert.strictEqual(bot.world.getBlock(pos).biome.name, 'example:session_biome')
        assert.strictEqual((await bot.world.async.getBlock(pos)).biome.name, 'example:session_biome')
        assert.strictEqual(column.getBlock(local).biome.name, 'example:session_biome')
        assert.strictEqual(bot.world.raycast(pos.offset(0.5, 1.5, 0.5), new Vec3(0, -1, 0), 3).biome.name, 'example:session_biome')
        assert.strictEqual(bot.world.getBiome(pos), biomeId)
        assert.strictEqual(bot.world.getBlock(pos).name, 'stone')
        assert.strictEqual(column.getBlockLight(local), 8)
        assert.strictEqual(column.getSkyLight(local), 12)
        assert.strictEqual(column.sections, sections)
        assert.strictEqual(column.blockLightSections, blockLight)
        assert.strictEqual(column.skyLightSections, skyLight)
        bot.registry = { ...bot.registry, biomes: { ...bot.registry.biomes, [biomeId]: { id: biomeId, name: 'example:changed_registry' } } }
        assert.strictEqual(bot.world.getBlock(pos).biome.name, 'example:changed_registry')
      })
    }
  }
  it('rejects a late truncated section and trailing bytes atomically', () => {
    const { bot, column } = setup(-64, 384)
    const before = column.biomes
    const valid = encode(column)
    let errors = 0
    let updates = 0
    bot.on('error', () => errors++)
    bot.on('chunkBiomesUpdate', () => updates++)
    for (const data of [valid.subarray(0, valid.length - 1), Buffer.concat([valid, Buffer.from([0])])]) {
      const packet = roundtrip(data)
      bot._client.emit(packet.name, packet.params)
      assert.strictEqual(column.biomes, before)
    }
    assert.strictEqual(errors, 2)
    assert.strictEqual(updates, 0)
  })
  it('rejects an indirect palette index outside its palette', () => {
    const { column } = setup(0, 256)
    const data = encode(column)
    // bpe=1, palette length=1, biome=0; one packed long with index 1.
    const bad = Buffer.concat([Buffer.from([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1]), data.subarray(2)])
    const before = column.biomes
    assert.throws(() => require('../lib/chunk_biomes')(column, bad, registry), /Invalid biome palette entry/)
    assert.strictEqual(column.biomes, before)
  })
})
