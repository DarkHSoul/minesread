/* eslint-env mocha */
const assert = require('assert')
const { resolveItemComponent, matchesComponentPredicate, getItemStackSize } = require('../lib/item_components')
const { createSerializer, createDeserializer } = require('minecraft-protocol/src/transforms/serializer')
const registry = require('prismarine-registry')('26.3')
const Item = require('prismarine-item')(registry)
function item (name, components = [], removed = []) {
  const raw = { itemCount: 1, itemId: registry.itemsByName[name].id, addedComponentCount: components.length, removedComponentCount: removed.length, components, removeComponents: removed.map(type => ({ type })) }
  const serializer = createSerializer({ state: 'play', version: '26.3', isServer: true })
  const parser = createDeserializer({ state: 'play', version: '26.3', isServer: false })
  const buffer = serializer.createPacketBuffer({ name: 'set_slot', params: { windowId: 0, stateId: 1, slot: 9, item: raw } })
  return Item.fromNotch(parser.parsePacketBuffer(buffer).data.params.item)
}
describe('26.3 effective item components', () => {
  it('resolves official defaults missing from the stack patch for merchant predicates', () => {
    const sword = item('diamond_sword')
    assert.strictEqual(sword.components.length, 0)
    assert(matchesComponentPredicate(registry, sword, [{ type: 'damage', data: 0 }, { type: 'max_damage', data: 1561 }]))
    assert(!matchesComponentPredicate(registry, sword, [{ type: 'damage', data: 1 }]))
  })
  it('distinguishes same-id patched and removed values using the real slot codec', () => {
    const ordinary = item('diamond_sword')
    const damaged = item('diamond_sword', [{ type: 'damage', data: 17 }])
    const removed = item('diamond_sword', [], ['damage'])
    assert.strictEqual(resolveItemComponent(registry, damaged, 'damage').value, 17)
    assert.strictEqual(resolveItemComponent(registry, ordinary, 'damage').value, 0)
    assert.deepStrictEqual(resolveItemComponent(registry, removed, 'damage'), { known: true, present: false })
    assert(!matchesComponentPredicate(registry, removed, [{ type: 'damage', data: 0 }]))
  })
  it('uses patched stack sizes and default edible/cooldown data', () => {
    assert.strictEqual(getItemStackSize(registry, item('ender_pearl')), 16)
    assert.strictEqual(getItemStackSize(registry, item('stone', [{ type: 'max_stack_size', data: 3 }])), 3)
    assert.strictEqual(resolveItemComponent(registry, item('golden_apple'), 'food').value.canAlwaysEat, true)
    assert.strictEqual(resolveItemComponent(registry, item('bread'), 'food').value.canAlwaysEat, false)
    assert.strictEqual(resolveItemComponent(registry, item('ender_pearl'), 'use_cooldown').value.seconds, 1)
  })
  it('distinguishes unknown registry values from known absent and honors removals over stale maps', () => {
    const unknown = { type: 999999, name: 'future_item', components: [] }
    assert.deepStrictEqual(resolveItemComponent(registry, unknown, 'damage'), { known: false, present: false })
    assert.deepStrictEqual(resolveItemComponent(registry, item('stone'), 'food'), { known: true, present: false })
    const stack = item('stone', [{ type: 'max_stack_size', data: 3 }]); stack.removedComponents.push({ type: 'max_stack_size' })
    assert.deepStrictEqual(resolveItemComponent(registry, stack, 'max_stack_size'), { known: true, present: false })
  })
  it('accepts a merchant payment predicate satisfied by a default component', async () => {
    const { EventEmitter } = require('events')
    const bot = new EventEmitter()
    bot.registry = registry
    bot.supportFeature = registry.supportFeature
    bot._client = new EventEmitter()
    let selected = false
    bot._client.write = () => { selected = true }
    bot._syncWindow = async () => { throw new Error('reached server synchronization') }
    const payment = item('diamond_sword')
    const cost = item('diamond_sword', [{ type: 'damage', data: 0 }])
    const window = { slots: [null, null, null, payment], inventoryStart: 3, inventoryEnd: 4 }
    window.trades = [{ inputItem1: cost, realPrice: 1, maximumNbTradeUses: 1, nbTradeUses: 0 }]
    bot.currentWindow = window
    require('../lib/plugins/villager')(bot, {})
    await assert.rejects(bot.trade(window, 0, 1), /reached server synchronization/)
    assert(selected)
    payment.removedComponents.push({ type: 'damage' })
    await assert.rejects(bot.trade(window, 0, 1), /Not enough item 1/)
  })
  it('uses effective food and consumable components in bot.consume', async () => {
    const { EventEmitter } = require('events')
    const bot = new EventEmitter()
    Object.assign(bot, { version: '26.3', registry, _client: new EventEmitter(), QUICK_BAR_START: 36, food: 20, game: { gameMode: 'survival' }, entity: { id: 1, yaw: 0, pitch: 0 }, _nextSequence: () => 1 })
    bot.supportFeature = registry.supportFeature
    const sent = []
    bot._client.write = (name, params) => sent.push({ name, params })
    require('../lib/plugins/inventory')(bot, {})
    bot.quickBarSlot = 0
    bot.inventory.slots[36] = item('bread')
    await assert.rejects(bot.consume(), /Food is full/)
    bot.inventory.slots[36] = item('bread', [{ type: 'food', data: { nutrition: 5, saturationModifier: 6, canAlwaysEat: true } }])
    const consume = bot.consume()
    assert.strictEqual(sent.at(-1).name, 'use_item')
    bot._client.emit('entity_status', { entityId: 1, entityStatus: 9 })
    await consume
    bot.inventory.slots[36] = item('golden_apple', [], ['consumable'])
    await assert.rejects(bot.consume(), /not consumable/)
    bot.inventory.slots[36] = item('diamond_sword', [{ type: 'damage', data: 9999 }, { type: 'max_damage', data: 12 }])
    assert.strictEqual(bot.getItemDamage(bot.heldItem), 12)
    assert.strictEqual(bot.getItemMaxDurability(bot.heldItem), 12)
  })
  it('keeps default component values isolated across stacks and calls', () => {
    const first = item('bread')
    const other = item('bread')
    const food = resolveItemComponent(registry, first, 'food')
    food.value.canAlwaysEat = true
    food.value.nutrition = 999
    assert.strictEqual(resolveItemComponent(registry, first, 'food').value.canAlwaysEat, false)
    assert.strictEqual(resolveItemComponent(registry, other, 'food').value.nutrition, 5)
  })
  it('retains legacy patch behavior without applying 26.3 defaults', () => {
    const old = require('prismarine-registry')('1.20.5')
    assert.deepStrictEqual(resolveItemComponent(old, { name: 'stone' }, 'max_stack_size'), { known: false, present: false })
    assert.strictEqual(getItemStackSize(old, { name: 'stone', stackSize: 64 }), 64)
  })
})
