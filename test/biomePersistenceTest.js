/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')
const { SmartBuffer } = require('smart-buffer')
const { execFileSync } = require('child_process')
const registry = require('prismarine-registry')('26.3')
const Chunk = require('prismarine-chunk')(registry)
const World = require('prismarine-world')(registry)
const { DirectPaletteContainer } = require('prismarine-chunk/src/pc/common/PaletteContainer')

describe('biome update persistence', () => {
  it('restores existing direct JSON in a fresh process before any biome packet', () => {
    const chunk = new Chunk({ minY: -64, worldHeight: 384 })
    const container = new DirectPaletteContainer({ bitsPerValue: 7, capacity: 64, noSizePrefix: true })
    container.set(0, 42)
    chunk.biomes[0].data = container
    const json = JSON.parse(chunk.toJson())
    const biome = JSON.parse(json.biomes[0])
    delete biome.noSizePrefix // Previous versions did not persist this flag.
    json.biomes[0] = JSON.stringify(biome)
    const script = `
      require('./index.js')
      const Chunk = require('prismarine-chunk')('26.3')
      const chunk = Chunk.fromJson(process.argv[1])
      require('assert').strictEqual(chunk.getBiome({ x: 0, y: -64, z: 0 }), 42)
    `
    execFileSync(process.execPath, ['-e', script, JSON.stringify(json)], { cwd: require('path').resolve(__dirname, '..') })
  })
  for (const bits of [7, 9]) {
    it(`preserves all direct ${bits}-bit entries through repeated storage reloads`, async () => {
      const stored = new Map()
      const world = new World(null, {
        save: async (x, z, chunk) => stored.set(`${x},${z}`, chunk.toJson()),
        load: async (x, z) => stored.has(`${x},${z}`) ? Chunk.fromJson(stored.get(`${x},${z}`)) : null
      }, 0)
      const bot = new EventEmitter()
      Object.assign(bot, { _client: new EventEmitter(), registry, supportFeature: registry.supportFeature, world: world.sync, game: { minY: -64, height: 384 } })
      require('../lib/plugins/blocks')(bot, {})
      const chunk = new Chunk({ minY: -64, worldHeight: 384 })
      world.sync.setColumn(-1, 2, chunk)
      const update = new Chunk({ minY: -64, worldHeight: 384 })
      const palette = new DirectPaletteContainer({ bitsPerValue: bits, capacity: 64, noSizePrefix: true })
      const expected = Array.from({ length: 64 }, (_, i) => bits === 9 ? 448 + i : 42 + i % 19)
      expected.forEach((id, i) => palette.set(i, id))
      update.biomes[0].data = palette
      const buffer = new SmartBuffer()
      for (const section of update.biomes) section.write(buffer)
      const data = buffer.toBuffer()
      bot._client.emit('chunk_biomes', { biomes: [{ position: { x: -1, z: 2 }, data }] })
      for (let cycle = 0; cycle < 2; cycle++) {
        await world.saveNow()
        world.unloadColumn(-1, 2)
        const reloaded = await world.getColumn(-1, 2)
        for (let i = 0; i < 64; i++) {
          const pos = new Vec3((i & 3) * 4, -64 + (i >> 4) * 4, ((i >> 2) & 3) * 4)
          assert.strictEqual(reloaded.getBiome(pos), expected[i], `cycle ${cycle}, cell ${i}`)
        }
        assert.strictEqual(reloaded.biomes[0].data.data.capacity, 64)
        assert.strictEqual(reloaded.biomes[0].data.data.bitsPerValue, bits)
        const restored = new SmartBuffer()
        for (const section of reloaded.biomes) section.write(restored)
        assert.deepStrictEqual(restored.toBuffer(), data)
        world.saveAt(new Vec3(-16, -64, 32))
      }
    })
  }
  it('saves updated palettes and reloads them from storage', async () => {
    const stored = new Map()
    const storage = {
      save: async (x, z, chunk) => { stored.set(`${x},${z}`, chunk.toJson()) },
      load: async (x, z) => stored.has(`${x},${z}`) ? Chunk.fromJson(stored.get(`${x},${z}`)) : null
    }
    const world = new World(null, storage, 0)
    const bot = new EventEmitter()
    bot._client = new EventEmitter()
    bot.registry = registry
    bot.supportFeature = registry.supportFeature
    bot.world = world.sync
    bot.game = { minY: -64, height: 384 }
    require('../lib/plugins/blocks')(bot, {})
    const chunk = new Chunk({ minY: -64, worldHeight: 384 })
    bot.world.setColumn(-1, 2, chunk)
    await world.saveNow()
    assert.strictEqual(world.savingQueue.size, 0)
    const update = new Chunk({ minY: -64, worldHeight: 384 })
    const pos = new Vec3(0, -64, 0)
    const biome = registry.biomesByName.desert.id
    update.setBiome(pos, biome)
    const buffer = new SmartBuffer()
    for (const section of update.biomes) section.write(buffer)
    const emit = (x, data) => bot._client.emit('chunk_biomes', { biomes: [{ position: { x, z: 2 }, data }] })
    let errors = 0
    bot.on('error', () => errors++)
    emit(-1, Buffer.from([0]))
    emit(99, buffer.toBuffer())
    assert.strictEqual(errors, 1)
    assert.strictEqual(world.savingQueue.size, 0)
    emit(-1, buffer.toBuffer())
    assert.strictEqual(world.savingQueue.size, 1)
    assert.strictEqual(chunk.getBiome(pos), biome)
    await world.saveNow()
    world.unloadColumn(-1, 2)
    const reloaded = await world.getColumn(-1, 2)
    assert.notStrictEqual(reloaded, chunk)
    assert.strictEqual(reloaded.getBiome(pos), biome)
  })
})
