/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')
const { SmartBuffer } = require('smart-buffer')
const registry = require('prismarine-registry')('26.3')
const Chunk = require('prismarine-chunk')(registry)
const World = require('prismarine-world')(registry)
const injectCooldowns = require('../lib/item_cooldowns')

function botForBiomes (minY = -64, height = 384) {
  const bot = new EventEmitter()
  bot._client = new EventEmitter()
  bot.registry = registry
  bot.supportFeature = registry.supportFeature
  bot.game = { minY, height }
  bot.world = new World().sync
  require('../lib/plugins/blocks')(bot, {})
  const chunk = new Chunk({ minY, worldHeight: height })
  bot.world.setColumn(-1, -1, chunk)
  return { bot, chunk }
}
function biomeData (chunk) {
  const buffer = new SmartBuffer()
  for (const section of chunk.biomes) section.write(buffer)
  return buffer.toBuffer()
}

describe('26.3 biome API', () => {
  it('resolves initial biome IDs, including negative coordinates and Y', () => {
    const { bot, chunk } = botForBiomes()
    chunk.setBiome(new Vec3(15, -60, 15), registry.biomesByName.plains.id)
    assert.strictEqual(bot.blockAt(new Vec3(-1, -60, -1)).biome.name, 'plains')
    assert.strictEqual(bot.blockAt(new Vec3(1000, -60, 1000)), null)
  })
  it('uses session IDs rather than the static vanilla ordering', () => {
    const { bot, chunk } = botForBiomes()
    bot.registry = { ...registry, biomes: { 1: { id: 1, name: 'example:custom' } } }
    chunk.setBiome(new Vec3(0, -64, 0), 1)
    assert.strictEqual(bot.blockAt(new Vec3(-16, -64, -16)).biome.name, 'example:custom')
  })
  for (const [minY, height] of [[-64, 384], [0, 256]]) {
    it(`updates biome palettes without changing blocks (${minY}/${height})`, () => {
      const { bot, chunk } = botForBiomes(minY, height)
      const target = new Vec3(0, minY, 0)
      chunk.setBlockStateId(target, registry.blocksByName.stone.minStateId)
      const update = new Chunk({ minY, worldHeight: height })
      update.setBiome(target, registry.biomesByName.desert.id)
      update.setBiome(new Vec3(0, minY + height - 4, 0), registry.biomesByName.plains.id)
      let event
      bot.on('chunkBiomesUpdate', p => { event = p })
      bot._client.emit('chunk_biomes', { biomes: [{ position: { x: -1, z: -1 }, data: biomeData(update) }] })
      assert.strictEqual(bot.blockAt(new Vec3(-16, minY, -16)).biome.name, 'desert')
      assert.strictEqual(bot.blockAt(new Vec3(-16, minY, -16)).name, 'stone')
      assert.strictEqual(bot.blockAt(new Vec3(-16, minY + height - 4, -16)).biome.name, 'plains')
      assert.deepStrictEqual(event, new Vec3(-16, 0, -16))
    })
  }
  it('keeps existing biomes on malformed data and ignores unloaded columns', () => {
    const { bot, chunk } = botForBiomes()
    const before = chunk.biomes
    let errors = 0
    bot.on('error', () => errors++)
    bot._client.emit('chunk_biomes', { biomes: [{ position: { x: -1, z: -1 }, data: Buffer.from([0, 1]) }] })
    assert.strictEqual(chunk.biomes, before)
    assert.strictEqual(errors, 1)
    bot._client.emit('chunk_biomes', { biomes: [{ position: { x: 100, z: 100 }, data: Buffer.alloc(0) }] })
    assert.strictEqual(errors, 1)
    assert.strictEqual(bot.world.getColumn(100, 100), undefined)
  })
})

describe('item cooldown API', () => {
  function create (version = '26.3') {
    const bot = new EventEmitter()
    bot._client = new EventEmitter()
    bot.registry = require('prismarine-registry')(version)
    injectCooldowns(bot)
    return bot
  }
  it('tracks groups, refreshes durations and expires once on client ticks', () => {
    const bot = create()
    const ended = []
    bot.on('itemCooldownEnd', group => ended.push(group))
    bot._client.emit('set_cooldown', { cooldownGroup: 'minecraft:ender_pearl', cooldownTicks: 2 })
    bot.emit('clientTick')
    assert.strictEqual(bot.getItemCooldown('ender_pearl'), 1)
    bot._client.emit('set_cooldown', { cooldownGroup: 'minecraft:ender_pearl', cooldownTicks: 3 })
    for (let i = 0; i < 3; i++) bot.emit('clientTick')
    assert.strictEqual(bot.getItemCooldown('ender_pearl'), 0)
    bot.emit('clientTick')
    assert.deepStrictEqual(ended, ['minecraft:ender_pearl'])
  })
  it('resolves custom component groups and server removal independently of held item', () => {
    const bot = create()
    const item = { name: 'ender_pearl', components: [{ type: 'use_cooldown', data: { cooldownGroup: 'example:shared', seconds: 2 } }] }
    bot._client.emit('set_cooldown', { cooldownGroup: 'example:shared', cooldownTicks: 40 })
    assert.strictEqual(bot.getItemCooldown(item), 40)
    assert.strictEqual(bot.getItemCooldown('ender_pearl'), 0)
    bot._client.emit('set_cooldown', { cooldownGroup: 'example:shared', cooldownTicks: 0 })
    assert.strictEqual(bot.getItemCooldown(item), 0)
  })
  it('clears on connection end and player respawn', () => {
    const bot = create()
    for (const event of ['respawn', 'end']) {
      bot._client.emit('set_cooldown', { cooldownGroup: 'minecraft:ender_pearl', cooldownTicks: 40 })
      bot.emit(event)
      assert.strictEqual(bot.getItemCooldown('ender_pearl'), 0)
    }
  })
  it('retains pre-group protocol support', () => {
    const bot = create('1.20.4')
    const item = bot.registry.itemsByName.ender_pearl
    bot._client.emit('set_cooldown', { itemID: item.id, cooldownTicks: 20 })
    assert.strictEqual(bot.getItemCooldown(item.id), 20)
    assert.strictEqual(bot.getItemCooldown({ type: item.id, name: item.name }), 20)
  })
})
