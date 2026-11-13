/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const mc = require('minecraft-protocol')
const inject = require('../lib/plugins/craft')

function create (version = '26.3') {
  const bot = new EventEmitter()
  bot.registry = require('prismarine-registry')(version)
  const Item = require('prismarine-item')(bot.registry)
  bot._client = new EventEmitter()
  bot.writes = []
  bot._client.write = (name, params) => bot.writes.push({ name, params })
  bot.supportFeature = name => bot.registry.supportFeature(name)
  bot.inventory = require('prismarine-windows')(bot.registry).createWindow(0, 'minecraft:inventory', 'Inventory')
  bot.getServerRecipe = id => id === 42 ? {} : null
  bot.putSelectedItemRange = async () => { (bot.currentWindow || bot.inventory).selectedItem = null }
  bot.clickWindow = async (slot, button) => {
    const window = bot.currentWindow || bot.inventory
    if (slot >= window.inventoryStart) window.selectedItem = window.slots[slot]
    else window.slots[slot] = new Item(window.selectedItem.type, 1)
  }
  bot.removed = []
  bot.putAway = async slot => {
    const window = bot.currentWindow || bot.inventory
    bot.removed.push(window.slots[slot])
    window.slots[slot] = null
  }
  bot.closeWindow = async () => { bot.currentWindow = null }
  inject(bot)
  return { bot, Item }
}

function plan (id, result) {
  return { inShape: [[{ id, metadata: null }]], result: { id: result, count: 1 }, requiresTable: false }
}

describe('crafting screen APIs', () => {
  for (const table of [false, true]) {
    it(`uses server output and remainders in the ${table ? '3x3 table' : '2x2 inventory'} grid`, async () => {
      const { bot, Item } = create()
      const ingredient = bot.registry.itemsByName.oak_planks.id
      const result = bot.registry.itemsByName.stick.id
      const window = table ? require('prismarine-windows')(bot.registry).createWindow(3, 'minecraft:crafting', 'Crafting') : bot.inventory
      if (table) bot.activateBlock = async () => { bot.currentWindow = window; bot.emit('windowOpen', window) }
      window.updateSlot(window.inventoryStart, new Item(ingredient, 8))
      window.slots[2] = new Item(ingredient, 1) // stale input must be cleared
      const output = new Item(result, 4)
      output.components = [{ type: 'custom_name', data: 'Server result' }]
      const remainder = new Item(bot.registry.itemsByName.bucket.id, 1)
      let syncs = 0
      bot._syncWindow = async () => {
        syncs++
        if (syncs === 1) window.slots[0] = output
        if (syncs === 2) window.slots[1] = remainder
      }
      const recipe = plan(ingredient, result)
      await bot.craft(recipe, 1, table ? {} : undefined)
      assert.deepStrictEqual(bot.removed, [bot.removed[0], output, remainder])
      assert.strictEqual(bot.removed[0].type, ingredient)
      assert.strictEqual(window.slots[0], null)
      assert.strictEqual(window.slots[1], null)
      assert.ok(syncs >= 3)
    })
  }

  it('rejects a missing authoritative result without fabricating an item', async () => {
    const { bot, Item } = create()
    const id = bot.registry.itemsByName.oak_planks.id
    bot.inventory.updateSlot(9, new Item(id, 1))
    bot._syncWindow = async () => {}
    await assert.rejects(bot.craft(plan(id, id)), /Server rejected crafting recipe/)
    assert.strictEqual(bot.inventory.slots[0], null)
    assert.strictEqual(bot.removed.length, 0)
  })

  it('rejects a different server result and removes failed open listeners', async () => {
    const { bot, Item } = create()
    const plank = bot.registry.itemsByName.oak_planks.id
    const stick = bot.registry.itemsByName.stick.id
    bot.inventory.updateSlot(9, new Item(plank, 1))
    bot._syncWindow = async () => { bot.inventory.slots[0] = new Item(plank, 1) }
    await assert.rejects(bot.craft(plan(plank, stick)), /unexpected crafting result/)
    assert.strictEqual(bot.removed.length, 0)
    bot.activateBlock = async () => { throw new Error('activation failed') }
    await assert.rejects(bot.craft(plan(plank, stick), 1, {}), /activation failed/)
    await new Promise(resolve => setImmediate(resolve))
    assert.strictEqual(bot.listenerCount('windowOpen'), 0)
  })

  it('retains manual result prediction for legacy transaction protocols', async () => {
    const { bot, Item } = create('1.16.5')
    const plank = bot.registry.itemsByName.oak_planks.id
    const stick = bot.registry.itemsByName.stick.id
    bot.inventory.updateSlot(9, new Item(plank, 1))
    bot._syncWindow = async () => { throw new Error('legacy must not use state barriers') }
    await bot.craft(plan(plank, stick))
    assert.strictEqual(bot.removed[0].type, stick)
    assert.throws(() => bot.requestRecipePlacement(42), /requires 1.21.2/)
  })

  it('validates craft counts before changing inventory', async () => {
    const { bot } = create()
    for (const count of [0, -1, 1.5, NaN, Infinity, '2x']) await assert.rejects(bot.craft({}, count), /positive integer/)
    assert.strictEqual(bot.removed.length, 0)
  })

  it('rejects inventory crafting while a different menu is open', async () => {
    const { bot } = create()
    bot.currentWindow = { id: 3, type: 'minecraft:generic_9x3' }
    await assert.rejects(bot.craft({}), /Close the current window/)
    assert.strictEqual(bot.removed.length, 0)
  })

  it('filters static recipes by available ingredients and grid size', () => {
    const { bot, Item } = create()
    const plank = bot.registry.itemsByName.oak_planks.id
    const table = bot.registry.itemsByName.crafting_table.id
    const chest = bot.registry.itemsByName.chest.id
    bot.inventory.slots[9] = new Item(plank, 4)
    assert.ok(bot.recipesFor(table, null, 1).length > 0)
    assert.strictEqual(bot.recipesFor(table, null, 2).length, 0)
    assert.strictEqual(bot.recipesAll(chest).length, 0)
    assert.ok(bot.recipesAll(chest, null, {}).length > 0)
  })

  it('crafts through actual authoritative inventory clicks and 26.3 slot codecs', async () => {
    const bot = new EventEmitter()
    Object.assign(bot, { version: '26.3', registry: require('prismarine-registry')('26.3'), _client: new EventEmitter(), QUICK_BAR_START: 36 })
    bot.supportFeature = bot.registry.supportFeature
    require('../lib/plugins/inventory')(bot, {})
    inject(bot)
    const Item = require('prismarine-item')(bot.registry)
    const milk = bot.registry.itemsByName.milk_bucket.id
    const stick = bot.registry.itemsByName.stick.id
    const bucket = bot.registry.itemsByName.bucket.id
    const slots = Array(46).fill(null)
    slots[9] = new Item(milk, 1)
    let cursor = null
    let stateId = 0
    let takes = 0
    const result = new Item(stick, 4)
    result.components = [{ type: 'custom_name', data: { type: 'string', value: 'Server-defined result' } }]
    const outgoing = mc.createSerializer({ state: 'play', isServer: false, version: '26.3' })
    const readOutgoing = mc.createDeserializer({ state: 'play', isServer: true, version: '26.3' })
    const incoming = mc.createSerializer({ state: 'play', isServer: true, version: '26.3' })
    const readIncoming = mc.createDeserializer({ state: 'play', isServer: false, version: '26.3' })
    const sync = () => {
      const params = { windowId: 0, stateId: ++stateId, items: slots.map(Item.toNotch), carriedItem: Item.toNotch(cursor) }
      const decoded = readIncoming.parsePacketBuffer(incoming.createPacketBuffer({ name: 'window_items', params })).data
      bot._client.emit(decoded.name, decoded.params)
    }
    bot._client.write = (name, params) => {
      const packet = readOutgoing.parsePacketBuffer(outgoing.createPacketBuffer({ name, params })).data
      if (name !== 'window_click') return
      const { slot, mode, mouseButton } = packet.params
      queueMicrotask(() => {
        if (mode === 0 && slot === 0) {
          cursor = slots[0]
          slots[0] = null
          slots[1] = new Item(bucket, 1)
          takes++
        } else if (mode === 0 && slot >= 0) {
          if (mouseButton === 1 && cursor) {
            slots[slot] = new Item(cursor.type, 1)
            cursor = null
            if (slot === 1) slots[0] = result
          } else {
            const previous = slots[slot]
            slots[slot] = cursor
            cursor = previous
          }
        } else if (mode === 1 && slots[slot]) {
          const destination = slots.findIndex((item, index) => index >= 9 && index < 45 && !item)
          slots[destination] = slots[slot]
          slots[slot] = null
        }
        sync()
      })
    }
    sync()
    await bot.craft(plan(milk, stick))
    assert.strictEqual(takes, 1)
    const output = bot.inventory.items().find(item => item.type === stick)
    assert.strictEqual(output.count, 4)
    assert.deepStrictEqual(output.components, result.components)
    assert.strictEqual(bot.inventory.count(bucket), 1)
    assert.strictEqual(bot.inventory.selectedItem, null)
    assert.strictEqual(bot.inventory.slots[1], null)
  })

  it('encodes numeric display placement and exposes server ghost responses', () => {
    const { bot } = create()
    bot.requestRecipePlacement(42, true)
    const serializer = mc.createSerializer({ state: 'play', isServer: false, version: '26.3' })
    const parser = mc.createDeserializer({ state: 'play', isServer: true, version: '26.3' })
    const packet = parser.parsePacketBuffer(serializer.createPacketBuffer(bot.writes[0])).data
    assert.strictEqual(packet.name, 'craft_recipe_request')
    assert.deepStrictEqual(packet.params, { windowId: 0, recipeId: 42, makeAll: true })
    for (const id of [null, '42', -1, 99, 2147483648]) assert.throws(() => bot.requestRecipePlacement(id), /ID/)
    bot.currentWindow = { id: 4, type: 'minecraft:generic_9x3' }
    assert.throws(() => bot.requestRecipePlacement(42), /crafting window/)
    let ghost
    bot.on('recipePlacementGhost', packet => { ghost = packet })
    const response = { windowId: 0, recipeDisplay: { type: 'crafting_shapeless', data: { ingredients: [], result: { type: 'empty' }, craftingStation: { type: 'empty' } } } }
    const serverSerializer = mc.createSerializer({ state: 'play', isServer: true, version: '26.3' })
    const clientParser = mc.createDeserializer({ state: 'play', isServer: false, version: '26.3' })
    const decoded = clientParser.parsePacketBuffer(serverSerializer.createPacketBuffer({ name: 'craft_recipe_response', params: response })).data
    bot._client.emit(decoded.name, decoded.params)
    assert.deepStrictEqual(ghost, decoded.params)
  })
})
