/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')

describe('multipart target integration', () => {
  it('retains live dragons across same-world respawn and retires them on dimension change', () => {
    const bot = new EventEmitter()
    bot.version = '26.3'
    bot.registry = require('prismarine-registry')(bot.version)
    bot.supportFeature = bot.registry.supportFeature
    bot._client = new EventEmitter()
    require('../lib/plugins/entities')(bot)
    require('../lib/plugins/entity_observation')(bot)
    bot._client.emit('login', { entityId: 1, worldState: { name: 'minecraft:the_end' } })
    bot.emit('login')
    bot._client.emit('spawn_entity', {
      entityId: 100,
      objectUUID: '00000000-0000-0000-0000-000000000100',
      type: bot.registry.entitiesByName.ender_dragon.id,
      x: 0,
      y: 64,
      z: 0,
      yaw: 0,
      pitch: 0,
      headPitch: 0
    })
    const dragon = bot.entities[100]
    const parts = bot.getEntityParts(dragon)
    for (let i = 0; i < 16; i++) bot.emit('clientTick')
    bot._client.emit('respawn', { worldState: { name: 'minecraft:the_end' }, copyMetadata: 0 })
    assert.strictEqual(bot.entities[100], dragon)
    assert.strictEqual(bot.getEntityParts(dragon), parts)
    assert(parts.every(part => part.initialized && part.historyComplete))
    bot._client.emit('respawn', { worldState: { name: 'minecraft:overworld' }, copyMetadata: 3 })
    assert(parts.every(part => !part.initialized && part.position === null))
    assert.deepStrictEqual(bot.getEntityParts(dragon), [])
    assert.strictEqual(bot.entityParts.size, 0)
  })

  it('selects an initialized part, preserves uncertainty, and attacks its wire ID', () => {
    const bot = new EventEmitter()
    bot.version = '26.3'
    bot.registry = require('prismarine-registry')(bot.version)
    bot.supportFeature = bot.registry.supportFeature
    bot.getControlState = () => false
    bot._client = new EventEmitter()
    const writes = []
    bot._client.write = (name, params) => writes.push({ name, params })
    require('../lib/plugins/entities')(bot)
    require('../lib/plugins/entity_observation')(bot)
    require('../lib/plugins/ray_trace')(bot)
    require('../lib/plugins/combat')(bot)
    const dragon = { id: 100, name: 'ender_dragon', position: new Vec3(0, 64, 0), yaw: 0, metadata: {} }
    bot.entities[100] = dragon
    const head = bot.getEntityParts(dragon)[0]
    bot.entity = { id: 1, position: head.position.offset(0, -1.12, 2), eyeHeight: 1.62, height: 1.8, yaw: 0, pitch: 0 }
    bot.world = { raycast: () => null }
    const target = bot.entityPartAtCursor(3)
    assert.ok(target)
    assert.strictEqual(target.parent, dragon)
    assert.strictEqual(target.confidence, 'approximate')
    assert.notStrictEqual(target.id, dragon.id)
    bot.attack(target, false)
    const attack = writes.find(w => w.name === 'attack')
    assert.strictEqual(attack.params.entityId, target.id)
    const mc = require('minecraft-protocol')
    const serializer = mc.createSerializer({ state: 'play', isServer: false, version: '26.3' })
    const parser = mc.createDeserializer({ state: 'play', isServer: true, version: '26.3' })
    assert.strictEqual(parser.parsePacketBuffer(serializer.createPacketBuffer(attack)).data.params.entityId, target.id)
    bot.world.raycast = () => ({ intersect: bot.entity.position.offset(0, 1.62, -0.1) })
    assert.strictEqual(bot.entityPartAtCursor(3), null)
    bot.emit('entityGone', dragon)
    bot.world.raycast = () => null
    assert.strictEqual(bot.entityPartAtCursor(3), null)
    assert.strictEqual(target.initialized, false)
  })
})
