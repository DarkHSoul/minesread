/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const mc = require('minecraft-protocol')

function create (version = '26.3') {
  const bot = new EventEmitter()
  Object.assign(bot, { version, registry: require('prismarine-registry')(version), _client: new EventEmitter(), QUICK_BAR_START: 36 })
  bot.supportFeature = bot.registry.supportFeature
  const outgoing = mc.createSerializer({ state: 'play', isServer: false, version })
  const readOutgoing = mc.createDeserializer({ state: 'play', isServer: true, version })
  const incoming = mc.createSerializer({ state: 'play', isServer: true, version })
  const readIncoming = mc.createDeserializer({ state: 'play', isServer: false, version })
  bot.sent = []
  bot._client.write = (name, params) => {
    bot.sent.push(readOutgoing.parsePacketBuffer(outgoing.createPacketBuffer({ name, params })).data)
  }
  require('../lib/plugins/inventory')(bot, {})
  bot.receive = (name, params) => {
    const decoded = readIncoming.parsePacketBuffer(incoming.createPacketBuffer({ name, params })).data
    bot._client.emit(decoded.name, decoded.params)
  }
  bot.Item = require('prismarine-item')(bot.registry)
  bot.sync = (cursor = null) => bot.receive('window_items', {
    windowId: 0,
    stateId: 7,
    items: bot.inventory.slots.map(item => bot.Item.toNotch(item)),
    carriedItem: bot.Item.toNotch(cursor)
  })
  return bot
}

describe('authoritative inventory UI (26.3 wire)', () => {
  it('serializes each vanilla click mode without requiring local prediction', async () => {
    const bot = create()
    for (const [slot, button, mode] of [[9, 0, 0], [9, 0, 1], [9, 40, 2], [9, 2, 3], [9, 1, 4], [-999, 0, 5], [9, 1, 5], [-999, 2, 5], [9, 0, 6]]) {
      const pending = bot.clickWindow(slot, button, mode)
      await Promise.resolve()
      assert.deepStrictEqual(bot.sent.at(-1).params, { windowId: 0, stateId: -1, slot, mouseButton: button, mode, changedSlots: [], cursorItem: undefined })
      bot.sync()
      await pending
    }
  })

  it('waits for authoritative slots and preserves custom cursor components', async () => {
    const bot = create()
    const cursor = new bot.Item(bot.registry.itemsByName.stone.id, 3)
    cursor.components = [{ type: 'custom_name', data: { type: 'string', value: 'UI cursor' } }]
    let finished = false
    const click = bot.clickWindow(9, 0, 0).then(() => { finished = true })
    await Promise.resolve()
    assert.strictEqual(finished, false)
    await Promise.resolve()
    bot.sync(cursor)
    await click
    assert.strictEqual(bot.inventory.selectedItem.count, 3)
    assert.deepStrictEqual(bot.inventory.selectedItem.components, cursor.components)
    bot.receive('set_cursor_item', { contents: bot.Item.toNotch(null) })
    assert.strictEqual(bot.inventory.selectedItem, null)
  })

  it('rejects and removes synchronization listeners when disconnected', async () => {
    const bot = create()
    const click = bot.clickWindow(9, 0, 0)
    await Promise.resolve()
    bot.emit('end')
    await assert.rejects(click, /Disconnected/)
    assert.strictEqual(bot.listenerCount('setWindowItems:0'), 0)
    assert.strictEqual(bot.listenerCount('windowClose'), 0)
  })

  it('serializes concurrent clicks through separate full-state replies', async () => {
    const bot = create()
    const first = bot.clickWindow(9, 0, 0)
    const second = bot.clickWindow(10, 0, 0)
    await Promise.resolve()
    assert.strictEqual(bot.sent.length, 1)
    bot.sync()
    await first
    await Promise.resolve()
    assert.strictEqual(bot.sent.length, 2)
    bot.sync()
    await second
  })

  it('transfers through the actual API and rejects a server refused placement', async () => {
    const bot = create()
    const id = bot.registry.itemsByName.stone.id
    bot.inventory.updateSlot(9, new bot.Item(id, 4))
    bot.inventory.updateSlot(10, new bot.Item(id, 2))
    const write = bot._client.write
    bot._client.write = (name, params) => {
      write(name, params)
      if (name !== 'window_click') return
      queueMicrotask(() => {
        // An independent server model accepts the source pickup but refuses
        // the restricted destination. A refusal must not report success.
        if (params.slot === 10) {
          bot.inventory.selectedItem = bot.inventory.slots[10]
          bot.inventory.updateSlot(10, null)
        }
        bot.sync(bot.inventory.selectedItem)
      })
    }
    await assert.rejects(bot.transfer({ itemType: id, count: 2, sourceStart: 9, sourceEnd: 11, destStart: 12, destEnd: 13, itemMatcher: item => item.count === 2 }), /did not accept item transfer/)
    assert.strictEqual(bot.sent[0].params.slot, 10)
    assert.strictEqual(bot.inventory.slots[9].count, 4)
  })

  it('rejects a synchronization barrier when its container closes', async () => {
    const bot = create()
    const window = bot.inventory
    const pending = bot._syncWindow(window)
    await Promise.resolve()
    bot.emit('windowClose', window)
    await assert.rejects(pending, /Window closed/)
    assert.strictEqual(bot.listenerCount('setWindowItems:0'), 0)
  })

  it('cleans failed activation listeners immediately', async () => {
    const bot = create()
    bot.activateBlock = async () => { throw new Error('activation failed') }
    bot.activateEntity = bot.activateBlock
    await assert.rejects(bot.openBlock({}), /activation failed/)
    await assert.rejects(bot.openEntity({}), /activation failed/)
    await Promise.resolve()
    assert.strictEqual(bot.listenerCount('windowOpen'), 0)
  })

  it('emits one server close event and ignores stale client closes', async () => {
    const bot = create()
    const windows = require('prismarine-windows')(bot.version)
    const active = windows.createWindow(2, 'minecraft:generic_9x3', 'Chest')
    const stale = windows.createWindow(1, 'minecraft:generic_9x3', 'Old chest')
    bot.currentWindow = active
    let closed = 0
    active.on('close', () => { closed++ })
    await bot.closeWindow(stale)
    assert.strictEqual(bot.currentWindow, active)
    assert.strictEqual(bot.sent.length, 0)
    bot.receive('close_window', { windowId: 1 })
    assert.strictEqual(bot.currentWindow, active)
    bot.receive('close_window', { windowId: 2 })
    bot.receive('close_window', { windowId: 2 })
    assert.strictEqual(closed, 1)
    assert.strictEqual(bot.currentWindow, null)
  })

  it('copies component-only player stack changes on client and server close', async () => {
    for (const serverClose of [false, true]) {
      const bot = create()
      const window = require('prismarine-windows')(bot.version).createWindow(2, 'minecraft:generic_9x3', 'Chest')
      const id = bot.registry.itemsByName.stone.id
      const oldItem = new bot.Item(id, 3)
      oldItem.components = [{ type: 'custom_name', data: { type: 'string', value: 'Old name' } }]
      const changed = new bot.Item(id, 3)
      changed.components = [{ type: 'custom_name', data: { type: 'string', value: 'New name' } }]
      bot.inventory.updateSlot(9, oldItem)
      window.updateSlot(window.inventoryStart, changed)
      bot.currentWindow = window
      if (serverClose) bot.receive('close_window', { windowId: 2 })
      else await bot.closeWindow(window)
      assert.deepStrictEqual(bot.inventory.slots[9].components, changed.components)
    }
  })

  it('keeps legacy prediction and transaction support', async () => {
    const bot = create('1.16.5')
    const item = new bot.Item(bot.registry.itemsByName.stone.id, 3)
    bot.inventory.updateSlot(9, item)
    const click = bot.clickWindow(9, 0, 0)
    const packet = bot.sent.at(-1)
    assert.strictEqual(packet.params.action, 1)
    bot._client.emit('transaction', { windowId: 0, action: 1, accepted: true })
    await click
    assert.strictEqual(bot.inventory.selectedItem.count, 3)
  })
})
