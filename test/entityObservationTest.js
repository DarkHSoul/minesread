/* global describe, it */
const assert = require('assert')
const { EventEmitter } = require('events')
const inject = require('../lib/plugins/entity_observation')
const registry = require('minecraft-data')('26.3')

function botFixture () {
  const bot = new EventEmitter()
  Object.assign(bot, { registry, version: '26.3', entities: {}, _client: new EventEmitter() })
  inject(bot)
  return bot
}

describe('entity observations', () => {
  it('uses registry names, retains raw data and distinguishes missing from false', () => {
    const bot = botFixture()
    const entity = { id: 3, name: 'creeper', metadata: { 9: 12, 17: false } }
    bot.entities[3] = entity
    const state = bot.getEntityState(3)
    assert.strictEqual(state.health, 12)
    assert.strictEqual(state.creeper.powered, false)
    assert.strictEqual(state.creeper.ignited, undefined)
    assert.strictEqual(state.onFire, undefined)
    assert.deepStrictEqual(entity.metadata, { 9: 12, 17: false })
  })
  it('observes incremental updates with previous snapshot', () => {
    const bot = botFixture()
    const entity = { id: 4, name: 'blaze', metadata: { 16: 0 } }
    const events = []
    bot.on('entityStateUpdate', (...args) => events.push(args))
    bot.emit('entitySpawn', entity)
    entity.metadata[16] = 1
    bot.emit('entityUpdate', entity)
    assert.strictEqual(events[1][1].blaze.charged, true)
    assert.strictEqual(events[1][2].blaze.charged, false)
  })
  it('decodes shared and frozen values without inventing a fuse', () => {
    const bot = botFixture()
    const state = bot.getEntityState({ name: 'creeper', metadata: { 0: 0x89, 7: 140, 16: 1, 18: true } })
    assert.strictEqual(state.onFire, true)
    assert.strictEqual(state.sprinting, true)
    assert.strictEqual(state.fallFlying, true)
    assert.strictEqual(state.fullyFrozen, true)
    assert.strictEqual(state.creeper.swellDirection, 1)
    assert.strictEqual(state.creeper.remainingFuse, undefined)
  })
  it('reports dragon phase names and unknown IDs faithfully', () => {
    const bot = botFixture()
    const entity = { name: 'ender_dragon', metadata: { 16: 5 } }
    assert.deepStrictEqual(bot.getDragonPhase(entity), { id: 5, name: 'SittingFlaming' })
    entity.metadata[16] = 99
    assert.deepStrictEqual(bot.getDragonPhase(entity), { id: 99, name: undefined })
  })
  it('declines unverified semantic decoding on other versions', () => {
    const bot = botFixture()
    bot.version = '1.21.11'
    const state = bot.getEntityState({ name: 'creeper', metadata: { 0: 1 } })
    assert.strictEqual(state.metadata.shared_flags, 1)
    assert.strictEqual(state.onFire, undefined)
  })
})

module.exports = { botFixture }
