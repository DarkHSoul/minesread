/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const { createSerializer, createDeserializer } = require('minecraft-protocol/src/transforms/serializer')

function roundtrip (name, params, isServer = true) {
  const options = { state: 'play', version: '26.3' }
  const serializer = createSerializer({ ...options, isServer })
  const parser = createDeserializer({ ...options, isServer: !isServer })
  return parser.parsePacketBuffer(serializer.createPacketBuffer({ name, params })).data.params
}

function setup () {
  const bot = new EventEmitter()
  bot.registry = require('prismarine-registry')('26.3')
  bot.supportFeature = bot.registry.supportFeature
  bot._client = new EventEmitter()
  bot._client.write = (name, params) => { bot.lastPacket = roundtrip(name, params, false) }
  const window = new EventEmitter()
  Object.assign(window, { id: 7, type: 'minecraft:merchant', slots: Array(39).fill(null), inventoryStart: 3, inventoryEnd: 39 })
  bot.currentWindow = window
  bot.openEntity = async () => window
  bot._syncWindow = async () => {}
  bot.putAway = async slot => { window.slots[slot] = null }
  bot.transfer = async options => { window.slots[options.destStart] = { ...window.slots.find(options.itemMatcher), count: options.count } }
  require('../lib/plugins/villager')(bot, {})
  return { bot, window }
}
function offer (bot, second = null) {
  return {
    inputItem1: { itemId: bot.registry.itemsByName.emerald.id, itemCount: 2, components: [] },
    inputItem2: second,
    outputItem: { itemId: bot.registry.itemsByName.bread.id, itemCount: 1, components: [], removeComponents: [], addedComponentCount: 0, removedComponentCount: 0 },
    tradeDisabled: false,
    nbTradeUses: 0,
    maximumNbTradeUses: 3,
    xp: 2,
    specialPrice: 0,
    priceMultiplier: 0.05,
    demand: 0
  }
}
async function open (bot, window, trades, entity = 'villager') {
  const pending = bot.openVillager({ entityType: bot.registry.entitiesByName[entity].id })
  bot._client.emit('trade_list', roundtrip('trade_list', { windowId: window.id, trades, villagerLevel: 2, experience: 5, isRegularVillager: true, canRestock: true }))
  return pending
}

describe('merchant API and 26.3 protocol', () => {
  it('does not count the same payment stack twice for overlapping costs', async () => {
    const { bot, window } = setup()
    const raw = offer(bot)
    raw.inputItem2 = { ...raw.inputItem1 }
    await open(bot, window, [raw])
    const Item = require('prismarine-item')(bot.registry)
    window.slots[3] = new Item(raw.inputItem1.itemId, 3)
    await assert.rejects(bot.trade(window, 0, 1), /both trade costs/)
    assert.strictEqual(bot.lastPacket, undefined)
  })
  it('decodes absent second costs, component predicates, price and metadata, then emits refreshes', async () => {
    const { bot, window } = setup()
    const raw = offer(bot)
    raw.inputItem1.components = [{ type: 'max_stack_size', data: 16 }]
    raw.specialPrice = 100
    await open(bot, window, [raw])
    assert.strictEqual(window.trades[0].hasItem2, false)
    assert.strictEqual(window.trades[0].inputItem2, null)
    assert.deepStrictEqual(window.trades[0].inputItem1.removedComponents, [])
    assert.strictEqual(window.trades[0].realPrice, 16)
    assert.strictEqual(window.canRestock, true)
    window.selectedTrade = window.trades[0]
    let updates = 0
    window.on('tradesUpdated', () => updates++)
    raw.nbTradeUses = 2
    bot._client.emit('trade_list', { windowId: 7, trades: [raw], experience: 12 })
    await new Promise(resolve => setImmediate(resolve))
    assert.strictEqual(window.experience, 12)
    assert.strictEqual(window.selectedTrade, window.trades[0])
    assert.strictEqual(updates, 1)
    window.emit('close')
    assert.strictEqual(bot._client.listenerCount('trade_list'), 0)
  })
  it('supports wandering traders and optional second payment item', async () => {
    const { bot, window } = setup()
    const second = { itemId: bot.registry.itemsByName.diamond.id, itemCount: 1, components: [] }
    await open(bot, window, [offer(bot, second)], 'wandering_trader')
    assert.strictEqual(window.trades[0].inputs.length, 2)
    assert.strictEqual(window.trades[0].inputItem2.name, 'diamond')
  })
  it('validates index/count/exhaustion and treats zero count as no action', async () => {
    const { bot, window } = setup()
    await open(bot, window, [offer(bot)])
    for (const index of [-1, 0.5, '0bad', 4, undefined]) await assert.rejects(bot.trade(window, index, 1), /Invalid trade index/)
    for (const count of [-1, 0.5, NaN]) await assert.rejects(bot.trade(window, 0, count), /Invalid trade count/)
    await bot.trade(window, '0', 0)
    assert.strictEqual(bot.lastPacket, undefined)
    window.trades[0].tradeDisabled = true
    await assert.rejects(bot.trade(window, 0, 1), /trade blocked/)
  })
  it('requires matching cost components and records use only after output collection succeeds', async () => {
    const { bot, window } = setup()
    const raw = offer(bot)
    raw.inputItem1.components = [{ type: 'max_stack_size', data: 16 }]
    await open(bot, window, [raw])
    const Item = require('prismarine-item')(bot.registry)
    window.slots[3] = new Item(raw.inputItem1.itemId, 6)
    await assert.rejects(bot.trade(window, 0, 1), /Not enough item 1/)
    window.slots[3].components = [{ type: 'max_stack_size', data: 16 }]
    window.slots[2] = window.trades[0].outputItem
    bot.putAway = async () => { throw new Error('output failed') }
    await assert.rejects(bot.trade(window, 0, 1), /output failed/)
    assert.strictEqual(window.trades[0].nbTradeUses, 0)
    assert.deepStrictEqual(bot.lastPacket, { slot: 0 })
  })
  it('removes packet listeners when interaction fails or returns a wrong window', async () => {
    const { bot } = setup()
    bot.openEntity = async () => { throw new Error('failed') }
    await assert.rejects(bot.openVillager({ entityType: bot.registry.entitiesByName.villager.id }), /failed/)
    assert.strictEqual(bot._client.listenerCount('trade_list'), 0)
    bot.openEntity = async () => ({ type: 'minecraft:chest' })
    await assert.rejects(bot.openVillager({ entityType: bot.registry.entitiesByName.villager.id }), /Expected/)
    assert.strictEqual(bot._client.listenerCount('trade_list'), 0)
  })
  it('rejects stale menus and unconsumed server output without recording a use', async () => {
    const { bot, window } = setup()
    await open(bot, window, [offer(bot)])
    bot.currentWindow = null
    await assert.rejects(bot.trade(window, 0, 0), /Merchant window is not open/)
    bot.currentWindow = window
    const Item = require('prismarine-item')(bot.registry)
    window.slots[3] = new Item(window.trades[0].inputItem1.type, 6)
    await assert.rejects(bot.trade(window, 0, 1), /expected output/)
    window.slots[2] = window.trades[0].outputItem
    await assert.rejects(bot.trade(window, 0, 1), /did not consume payment/)
    assert.strictEqual(window.trades[0].nbTradeUses, 0)
  })
  it('rejects opening when the merchant closes before offers arrive', async () => {
    const { bot, window } = setup()
    const pending = bot.openVillager({ entityType: bot.registry.entitiesByName.villager.id })
    await new Promise(resolve => setImmediate(resolve))
    window.emit('close')
    await assert.rejects(pending, /closed before offers/)
    assert.strictEqual(bot._client.listenerCount('trade_list'), 0)
  })
  it('records a successful authoritative trade and exhaustion after consumption', async () => {
    const { bot, window } = setup()
    const raw = offer(bot)
    raw.maximumNbTradeUses = 1
    await open(bot, window, [raw])
    const Item = require('prismarine-item')(bot.registry)
    window.slots[3] = new Item(window.trades[0].inputItem1.type, 2)
    window.slots[2] = window.trades[0].outputItem
    bot.putAway = async slot => {
      window.slots[slot] = null
      if (slot === 2) window.slots[0] = null
    }
    await bot.trade(window, 0, 1)
    assert.strictEqual(window.trades[0].nbTradeUses, 1)
    assert.strictEqual(window.trades[0].tradeDisabled, true)
  })
})
