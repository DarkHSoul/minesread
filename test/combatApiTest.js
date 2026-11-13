/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
describe('26.3 attack timing', () => {
  function create () {
    const bot = new EventEmitter()
    bot.entity = { attributes: { 'minecraft:attack_speed': { value: 4, modifiers: [] } } }
    bot.attack = function (...args) { assert.strictEqual(this, bot); return args }
    require('../lib/plugins/combat')(bot)
    return bot
  }
  it('tracks ticks, fractional strength, attack resets, and legacy return', () => {
    const bot = create()
    assert.strictEqual(bot.getAttackStrengthDelay(), 5)
    bot.emit('clientTick')
    assert.strictEqual(bot.getAttackStrengthScale(0.5), Math.fround(0.3))
    assert.deepStrictEqual(bot.attack('target', false), ['target', false])
    assert.strictEqual(bot.getAttackCooldownTicks(), 5)
    assert.strictEqual(bot.getItemSwapScale(), 0)
  })
  it('resets only when item type changes at tick time, and applies modifiers', () => {
    const bot = create()
    bot.heldItem = { type: 1, count: 1 }
    bot.emit('clientTick')
    bot.heldItem = { type: 1, count: 2 }
    bot.emit('clientTick')
    assert.strictEqual(bot.getAttackStrengthScale(), Math.fround(0.2))
    bot.entity.attributes['minecraft:attack_speed'].modifiers = [{ operation: 0, amount: -2 }, { operation: 1, amount: 0.5 }, { operation: 2, amount: 1 }]
    assert.strictEqual(bot.getAttackStrengthDelay(), Math.fround(20 / 6))
    delete bot.entity.attributes['minecraft:attack_speed']
    assert.strictEqual(bot.getAttackStrengthScale(), null)
  })
  it('sanitizes attack speed range including zero', () => {
    const bot = create()
    bot.entity.attributes['minecraft:attack_speed'].value = 0
    bot.emit('clientTick')
    assert.strictEqual(bot.getAttackStrengthDelay(), Infinity)
    assert.strictEqual(bot.getAttackStrengthScale(), 0)
    bot.entity.attributes['minecraft:attack_speed'].value = 2048
    assert.strictEqual(bot.getAttackStrengthDelay(), Math.fround(20 / 1024))
  })
})
