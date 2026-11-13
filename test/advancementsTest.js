/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const mc = require('minecraft-protocol')

function create () {
  const bot = new EventEmitter()
  bot._client = new EventEmitter()
  require('../lib/plugins/advancements')(bot)
  const serializer = mc.createSerializer({ state: 'play', isServer: true, version: '26.3' })
  const parser = mc.createDeserializer({ state: 'play', isServer: false, version: '26.3' })
  bot.receive = params => {
    const packet = { reset: false, advancementMapping: [], identifiers: [], progressMapping: [], showAdvancements: true, ...params }
    const decoded = parser.parsePacketBuffer(serializer.createPacketBuffer({ name: 'advancements', params: packet })).data
    bot._client.emit(decoded.name, decoded.params)
    return decoded.params
  }
  return bot
}
const definition = (key, requirements = [['a', 'b'], ['c']], parentId) => ({ key, value: { parentId, requirements, sendsTelemtryData: false }, x: 1, y: 2 })
const progress = (key, names) => ({ key, value: names.map(criterionIdentifier => ({ criterionIdentifier, criterionProgress: 1730000000123n })) })

describe('advancement synchronization (26.3 wire)', () => {
  it('uses AND of OR requirement groups, preserves i64 epoch milliseconds, and retains other progress', () => {
    const bot = create()
    let completed = 0
    bot.on('advancementCompleted', () => completed++)
    const first = bot.receive({ reset: true, advancementMapping: [definition('custom:root'), definition('custom:other', [['a']])], progressMapping: [progress('custom:root', ['b', 'c']), progress('custom:other', ['a'])] })
    assert.strictEqual(bot.isAdvancementDone('custom:root'), true)
    assert.strictEqual(completed, 0)
    assert.deepStrictEqual(bot.getAdvancement('custom:root').definition, first.advancementMapping[0])
    assert.strictEqual(BigInt(bot.getAdvancement('custom:root').progress[0].criterionProgress.toString()), 1730000000123n)
    bot.receive({ progressMapping: [progress('custom:root', ['b'])] })
    assert.strictEqual(bot.isAdvancementDone('custom:root'), false)
    assert.strictEqual(bot.isAdvancementDone('custom:other'), true)
    bot.receive({ progressMapping: [progress('custom:root', ['a', 'c'])] })
    bot.receive({ progressMapping: [progress('custom:root', ['a', 'c'])] })
    assert.strictEqual(completed, 1)
  })

  it('keeps missing definitions/progress/parents unknown and resolves late definitions', () => {
    const bot = create()
    bot.receive({ progressMapping: [progress('custom:missing', ['a'])], advancementMapping: [definition('custom:child', [['a']], 'custom:parent'), definition('custom:no_progress')] })
    assert.strictEqual(bot.isAdvancementDone('custom:missing'), null)
    assert.strictEqual(bot.isAdvancementDone('custom:no_progress'), null)
    bot.receive({ progressMapping: [progress('custom:child', ['a'])] })
    assert.strictEqual(bot.isAdvancementDone('custom:child'), null)
    bot.receive({ advancementMapping: [definition('custom:parent', []), definition('custom:missing', [['a']])], progressMapping: [progress('custom:parent', [])] })
    assert.strictEqual(bot.isAdvancementDone('custom:parent'), false)
    assert.strictEqual(bot.isAdvancementDone('custom:child'), true)
    assert.strictEqual(bot.isAdvancementDone('custom:missing'), true)
    assert.strictEqual(bot.isAdvancementDone('unknown'), null)
  })

  it('removes descendant definitions/progress and resets all caches', () => {
    const bot = create()
    bot.receive({ advancementMapping: [definition('root'), definition('child', [['a']], 'root')], progressMapping: [progress('child', ['a'])] })
    bot.receive({ identifiers: ['root'] })
    assert.strictEqual(bot.getAdvancement('child'), null)
    assert.strictEqual(bot.getAdvancement('root'), null)
    bot.receive({ progressMapping: [progress('unknown', ['a'])] })
    bot.receive({ reset: true })
    assert.deepStrictEqual(bot.getAdvancements(), [])
  })

  it('clears session state on login, end and reconfiguration, retaining it on respawn', () => {
    const bot = create()
    for (const event of ['login', 'end', 'start_configuration']) {
      bot.receive({ advancementMapping: [definition('a')] })
      bot._client.emit('respawn', {})
      assert.strictEqual(bot.getAdvancements().length, 1)
      ;(event === 'start_configuration' ? bot._client : bot).emit(event)
      assert.strictEqual(bot.getAdvancements().length, 0)
    }
  })

  it('treats absent criterion timestamps as incomplete and unknown fields conservatively', () => {
    const bot = create()
    bot.receive({ advancementMapping: [definition('a', [['a']])], progressMapping: [{ key: 'a', value: [{ criterionIdentifier: 'a' }] }] })
    assert.strictEqual(bot.isAdvancementDone('a'), false)
    bot._client.emit('advancements', { advancementMapping: [{ key: 'legacy', value: {} }] })
    assert.strictEqual(bot.isAdvancementDone('legacy'), null)
  })
})
