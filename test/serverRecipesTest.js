/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const mc = require('minecraft-protocol')

function create () {
  const bot = new EventEmitter()
  bot._client = new EventEmitter()
  require('../lib/plugins/server_recipes')(bot)
  const serializer = mc.createSerializer({ state: 'play', isServer: true, version: '26.3' })
  const parser = mc.createDeserializer({ state: 'play', isServer: false, version: '26.3' })
  bot.receive = (name, params) => {
    const decoded = parser.parsePacketBuffer(serializer.createPacketBuffer({ name, params })).data
    bot._client.emit(decoded.name, decoded.params)
    return decoded.params
  }
  return bot
}

const slot = id => ({ type: 'item', data: id })
const display = id => ({
  recipe: {
    displayId: id,
    display: { type: 'crafting_shapeless', data: { ingredients: [slot(1)], result: slot(2), craftingStation: slot(3) } },
    group: 0,
    category: 'crafting_misc',
    craftingRequirements: [{ ids: [1, 4] }]
  },
  flags: { notification: true, highlight: true }
})

describe('server recipe display synchronization (26.3 wire)', () => {
  it('preserves full displays, flags, requirements and numeric IDs, adds/removes/replaces', () => {
    const bot = create()
    let notifications = 0
    bot.on('serverRecipeNotification', () => notifications++)
    const packet = bot.receive('recipe_book_add', { entries: [display(42)], replace: true })
    assert.deepStrictEqual(bot.getServerRecipe(42), packet.entries[0])
    assert.strictEqual(bot.getServerRecipe('minecraft:42'), null)
    assert.strictEqual(bot.serverRecipes.highlighted.has(42), true)
    bot.receive('recipe_book_add', { entries: [display(43)], replace: false })
    assert.strictEqual(bot.getServerRecipes().length, 2)
    bot.receive('recipe_book_remove', { recipeIds: [42, 99] })
    assert.strictEqual(bot.getServerRecipe(42), null)
    assert.strictEqual(bot.serverRecipes.highlighted.has(42), false)
    assert.strictEqual(bot.getServerRecipes().length, 1)
    bot.receive('recipe_book_add', { entries: [], replace: true })
    assert.strictEqual(bot.getServerRecipes().length, 0)
    assert.strictEqual(notifications, 2)
  })

  it('preserves recursive displays and existing highlights when an entry is overwritten', () => {
    const bot = create()
    bot.receive('recipe_book_add', { entries: [display(5)], replace: true })
    const replacement = display(5)
    replacement.flags = { notification: false, highlight: false }
    replacement.recipe.display = {
      type: 'crafting_shaped',
      data: {
        width: 1,
        height: 1,
        ingredients: [{ type: 'with_remainder', data: { input: { type: 'composite', data: [slot(1), slot(4)] }, remainder: slot(8) } }],
        result: slot(2),
        craftingStation: slot(3)
      }
    }
    const packet = bot.receive('recipe_book_add', { entries: [replacement], replace: false })
    assert.deepStrictEqual(bot.getServerRecipe(5), packet.entries[0])
    assert.strictEqual(bot.serverRecipes.highlighted.has(5), true)
    bot.receive('recipe_book_add', { entries: [], replace: true })
    assert.strictEqual(bot.serverRecipes.highlighted.size, 0)
  })

  it('replaces property sets and stonecutter displays independently of book entries', () => {
    const bot = create()
    bot.receive('recipe_book_add', { entries: [display(7)], replace: false })
    const packet = bot.receive('declare_recipes', {
      recipes: [{ name: 'minecraft:furnace_input', items: [1, 4] }],
      stoneCutterRecipes: [{ input: { ids: [1] }, slotDisplay: slot(2) }]
    })
    assert.deepStrictEqual(bot.serverRecipes.properties.get('minecraft:furnace_input'), [1, 4])
    assert.deepStrictEqual(bot.serverRecipes.stonecutterRecipes, packet.stoneCutterRecipes)
    bot.receive('declare_recipes', { recipes: [], stoneCutterRecipes: [] })
    assert.strictEqual(bot.serverRecipes.properties.size, 0)
    assert.strictEqual(bot.getServerRecipes().length, 1)
    const settings = { crafting: { open: true, filtering: false }, furnace: { open: false, filtering: true }, blast: { open: true, filtering: true }, smoker: { open: false, filtering: false } }
    assert.deepStrictEqual(bot.receive('recipe_book_settings', settings), bot.serverRecipes.bookSettings)
  })

  it('clears session state on login, end and reconfiguration, retaining it on respawn', () => {
    const bot = create()
    for (const event of ['login', 'end', 'start_configuration']) {
      bot.receive('recipe_book_add', { entries: [display(1)], replace: true })
      bot._client.emit('respawn', {})
      assert.strictEqual(bot.getServerRecipes().length, 1)
      ;(event === 'start_configuration' ? bot._client : bot).emit(event)
      assert.strictEqual(bot.getServerRecipes().length, 0)
    }
  })

  it('leaves incompatible legacy recipe packets unknown', () => {
    const bot = create()
    bot._client.emit('declare_recipes', { recipes: [{ recipeId: 'minecraft:custom', data: {} }] })
    assert.strictEqual(bot.serverRecipes.received, false)
    assert.deepStrictEqual(bot.getServerRecipes(), [])
  })
})
