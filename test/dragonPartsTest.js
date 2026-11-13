/* global describe, it */
const assert = require('assert')
const { Vec3 } = require('vec3')
const { DragonFlightHistory } = require('../lib/dragon_parts')
const { botFixture } = require('./entityObservationTest')

describe('dragon multipart observations', () => {
  function fixture () {
    const bot = botFixture()
    const entity = { id: 100, name: 'ender_dragon', position: new Vec3(10, 70, 20), yaw: Math.PI, metadata: { 16: 6 } }
    bot.entities[100] = entity
    bot.emit('entitySpawn', entity)
    return { bot, entity, parts: bot.getEntityParts(entity) }
  }
  it('assigns packet IDs and vanilla dimensions without polluting entities', () => {
    const { bot, entity, parts } = fixture()
    assert.deepStrictEqual(parts.map(p => p.id), [101, 102, 103, 104, 105, 106, 107, 108])
    assert.deepStrictEqual(parts.map(p => [p.width, p.height]), [[1, 1], [3, 3], [5, 3], [2, 2], [2, 2], [2, 2], [4, 2], [4, 2]])
    assert(parts.every(p => p.parent === entity && p.initialized && p.confidence === 'approximate'))
    assert.deepStrictEqual(Object.keys(bot.entities), ['100'])
    assert.strictEqual(bot.getEntityParts(entity), parts)
  })
  it('uses sitting offset and correct yaw; updates phase and position', () => {
    const { bot, entity, parts } = fixture()
    assert(parts[0].position.distanceTo(new Vec3(10, 69, 13.5)) < 1e-10)
    assert(parts[6].position.distanceTo(new Vec3(14.5, 72, 20)) < 1e-10)
    entity.metadata[16] = 0
    entity.position.x = 20
    bot.emit('entityUpdate', entity)
    assert.strictEqual(parts[0].position.x, 20)
    assert.strictEqual(parts[0].position.y, 70)
  })
  it('wraps 64 samples and preserves initial fill semantics', () => {
    const history = new DragonFlightHistory()
    history.record(1, 2)
    assert.deepStrictEqual(history.get(63), { y: 1, yaw: 2 })
    for (let i = 2; i <= 80; i++) history.record(i, i * 2)
    assert.strictEqual(history.get(0).y, 80)
    assert.strictEqual(history.get(63).y, 17)
  })
  it('marks history coverage separately from geometry confidence', () => {
    const { bot, parts } = fixture()
    assert.strictEqual(parts[0].historyComplete, false)
    for (let i = 0; i < 16; i++) bot.emit('clientTick')
    assert.strictEqual(parts[0].historyComplete, true)
    assert.strictEqual(parts[0].confidence, 'approximate')
  })
  it('invalidates retained references on despawn and configuration reset', () => {
    const { bot, entity, parts } = fixture()
    bot.emit('entityGone', entity)
    assert.strictEqual(bot.entityParts.size, 0)
    assert(parts.every(p => !p.initialized && p.position === null))
    assert.deepStrictEqual(bot.getEntityParts(entity), [])
    const next = fixture()
    next.bot._client.emit('start_configuration')
    assert.strictEqual(next.bot.entityParts.size, 0)
    assert(next.parts.every(p => !p.initialized))
  })
  it('invalidates stale geometry and replaces parents sharing an ID', () => {
    const { bot, entity, parts } = fixture()
    entity.position.x = NaN
    bot.emit('entityMoved', entity)
    assert(parts.every(p => !p.initialized && p.position === null))
    const replacement = { ...entity, position: new Vec3(0, 80, 0) }
    bot.entities[entity.id] = replacement
    bot.emit('entitySpawn', replacement)
    const next = bot.getEntityParts(replacement)
    assert.notStrictEqual(next, parts)
    assert(next.every(p => p.parent === replacement && p.initialized))
    bot.emit('entityGone', entity)
    assert.strictEqual(bot.entityParts.get(entity.id), next)
  })
  it('keeps tail geometry finite across yaw wrap and climbing history', () => {
    const { bot, entity, parts } = fixture()
    for (let i = 0; i < 25; i++) {
      entity.position.y += 0.2
      entity.yaw = i < 12 ? 0.01 : 2 * Math.PI - 0.01
      bot.emit('clientTick')
    }
    assert(parts.every(p => [p.position.x, p.position.y, p.position.z].every(Number.isFinite)))
    assert(parts.slice(3, 6).every(p => p.position.distanceTo(entity.position) < 15))
  })
  it('declines initialization when yaw or coordinates are missing', () => {
    const bot = botFixture()
    const entity = { id: 1, name: 'ender_dragon', position: new Vec3(NaN, 0, 0), yaw: 0, metadata: {} }
    assert(bot.getEntityParts(entity).every(p => !p.initialized && p.position === null))
  })
})
