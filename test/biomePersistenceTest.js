/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')
const { SmartBuffer } = require('smart-buffer')
const registry = require('prismarine-registry')('26.3')
const Chunk = require('prismarine-chunk')(registry)
const World = require('prismarine-world')(registry)

describe('biome update persistence', () => {
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
