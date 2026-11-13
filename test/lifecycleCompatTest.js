/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')

function setup () {
  const bot = new EventEmitter()
  Object.assign(bot, { version: '26.3', registry: require('prismarine-registry')('26.3'), _client: new EventEmitter(), game: { minY: -64, height: 384 }, QUICK_BAR_START: 36 })
  bot.supportFeature = bot.registry.supportFeature
  bot.writes = []
  bot._client.state = 'play'
  bot._client.write = (name, params) => bot.writes.push({ name, params })
  bot._client.registerChannel = () => {}
  bot._client.writeChannel = () => {}
  return bot
}
const spawn = name => ({ entityId: 1, worldState: { name, dimension: 0, gamemode: 'survival' } })

describe('26.3 session lifecycle', () => {
  it('announces player readiness again after a configuration transfer login', () => {
    const bot = setup()
    require('../lib/plugins/game')(bot, {})
    require('../lib/plugins/health')(bot, { respawn: false })
    bot.registry.dimensionsArray = [{ name: 'overworld' }]
    bot.registry.dimensionsByName = { overworld: { minY: -64, height: 384 } }
    const health = { health: 20, food: 20, foodSaturation: 5 }
    bot._client.emit('login', spawn('example:first'))
    bot._client.emit('update_health', health)
    bot._client.emit('start_configuration', {})
    bot.registry.dimensionsArray = [{ name: 'overworld' }]
    bot._client.emit('login', spawn('example:second'))
    bot._client.emit('update_health', health)
    bot._client.emit('update_health', health)
    assert.strictEqual(bot.writes.filter(p => p.name === 'player_loaded').length, 2)
  })
  it('replaces chunks for different world names sharing a dimension type', () => {
    const bot = setup()
    require('../lib/plugins/blocks')(bot, {})
    bot._client.emit('login', spawn('example:first'))
    const Chunk = require('prismarine-chunk')(bot.registry)
    const chunk = new Chunk({ minY: -64, worldHeight: 384 })
    bot.world.setColumn(0, 0, chunk)
    bot._client.emit('respawn', spawn('example:first'))
    assert.strictEqual(bot.world.getColumn(0, 0), chunk)
    bot._client.emit('respawn', spawn('example:second'))
    assert(!bot.world.getColumn(0, 0), 'old column must be unloaded')
    assert.strictEqual(bot._getDimensionName(), 'example:second')
    bot.world.setColumn(0, 0, chunk)
    bot._client.emit('start_configuration', {})
    assert(!bot.world.getColumn(0, 0), 'configuration must not expose old chunks')
    assert.strictEqual(bot._getDimensionName(), undefined)
  })

  it('isolates old storage while the new world receives chunks', async () => {
    const bot = setup()
    let finishOldSave
    const saves = []
    require('../lib/plugins/blocks')(bot, {
      storageBuilder: ({ worldName }) => ({
        load: async () => null,
        save: async (x, z, column) => {
          saves.push({ worldName, column })
          if (worldName === 'example:first') await new Promise(resolve => { finishOldSave = resolve })
        }
      })
    })
    bot._client.emit('login', spawn('example:first'))
    const old = bot.world
    const Chunk = require('prismarine-chunk')(bot.registry)
    const first = new Chunk()
    old.setColumn(0, 0, first)
    bot._client.emit('respawn', { ...spawn('example:second'), worldState: { name: 'example:second', dimension: 1 } })
    const next = bot.world
    try {
      assert(next !== old, 'new world must not wait on old storage')
      const second = new Chunk()
      next.setColumn(0, 0, second)
      await next.async.saveNow()
      finishOldSave()
      await old.async.finishedSaving
      assert.strictEqual(next.getColumn(0, 0), second)
      assert(saves.some(s => s.worldName === 'example:first' && s.column === first))
      assert(saves.some(s => s.worldName === 'example:second' && s.column === second))
    } finally {
      finishOldSave?.()
      old.async.stopSaving()
      next.async.stopSaving()
    }
  })

  it('drops other-world entities while retaining same-world entities', () => {
    const bot = setup()
    require('../lib/plugins/entities')(bot)
    bot._client.emit('login', spawn('example:first'))
    const entity = { id: 42, position: new Vec3(0, 0, 0) }
    bot.entities[42] = entity
    bot._client.emit('respawn', spawn('example:first'))
    assert.strictEqual(bot.entities[42], entity)
    bot._client.emit('respawn', spawn('example:second'))
    assert.strictEqual(bot.entities[42], undefined)
    assert.strictEqual(bot.entities[1], bot.entity)
  })

  it('cancels pending menu clicks on configuration and prevents further play writes', async () => {
    const bot = setup()
    require('../lib/plugins/inventory')(bot, {})
    const pending = bot.clickWindow(9, 0, 0)
    await Promise.resolve()
    const rejection = assert.rejects(pending, /configuration|session/i)
    bot._client.state = 'configuration'
    bot._client.emit('start_configuration', {})
    await rejection
    const count = bot.writes.length
    await assert.rejects(bot.clickWindow(9, 0, 0), /configuration|session/i)
    assert.strictEqual(bot.writes.length, count)
  })

  it('invalidates dynamic registries during reconfiguration', () => {
    const bot = setup()
    require('../lib/plugins/game')(bot, {})
    bot.registry.dimensionsByName = { stale: { minY: -64, height: 384 } }
    bot.registry.biomes = { 42: { id: 42, name: 'stale' } }
    bot._client.emit('start_configuration', {})
    assert.strictEqual(bot.registry.dimensionsByName.stale, undefined)
    assert.strictEqual(bot.registry.biomes[42], undefined)
    const { createSerializer, createDeserializer } = require('minecraft-protocol')
    const serializer = createSerializer({ state: 'configuration', version: '26.3', isServer: true })
    const parser = createDeserializer({ state: 'configuration', version: '26.3', isServer: false })
    const nbt = require('prismarine-nbt')
    const wire = serializer.createPacketBuffer({
      name: 'registry_data',
      params: {
        id: 'minecraft:dimension_type',
        entries: [{ key: 'example:replacement', value: nbt.comp({ min_y: nbt.int(-32), height: nbt.int(128) }) }]
      }
    })
    const decoded = parser.parsePacketBuffer(wire).data
    bot._client.emit(decoded.name, decoded.params)
    assert.strictEqual(bot.registry.dimensionsArray[0].name, 'example:replacement')
    assert.strictEqual(bot.registry.dimensionsArray[0].height, 128)
    assert.strictEqual(bot.registry.dimensionsByName.stale, undefined)
  })
})
