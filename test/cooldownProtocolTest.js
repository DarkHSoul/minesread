/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')
const mc = require('minecraft-protocol')

function create (version = '26.3') {
  const bot = new EventEmitter()
  bot._client = new EventEmitter()
  bot._client.state = 'play'
  bot._client.write = () => {}
  bot._nextSequence = () => 0
  bot.version = version
  bot.registry = require('prismarine-registry')(version)
  bot.supportFeature = bot.registry.supportFeature
  bot.QUICK_BAR_START = 36
  bot.game = { gameMode: 'survival' }
  bot.food = 10
  bot.entity = { id: 1, position: new Vec3(0, 64, 0) }
  require('../lib/plugins/inventory')(bot, {})
  const serializer = mc.createSerializer({ state: 'play', isServer: true, version })
  const parser = mc.createDeserializer({ state: 'play', isServer: false, version })
  bot.receive = (name, params) => {
    const decoded = parser.parsePacketBuffer(serializer.createPacketBuffer({ name, params })).data
    bot._client.emit(decoded.name, decoded.params)
  }
  return bot
}

describe('cooldown protocol and inventory integration', () => {
  it('decodes modern cooldowns, refreshes durations and emits one expiry', () => {
    const bot = create()
    const starts = []
    const ends = []
    bot.on('itemCooldown', (...args) => starts.push(args))
    bot.on('itemCooldownEnd', group => ends.push(group))
    bot.receive('set_cooldown', { cooldownGroup: 'minecraft:ender_pearl', cooldownTicks: 2 })
    bot.emit('clientTick')
    bot.receive('set_cooldown', { cooldownGroup: 'minecraft:ender_pearl', cooldownTicks: 4 })
    assert.strictEqual(bot.getItemCooldown('ender_pearl'), 4)
    for (let i = 0; i < 5; i++) bot.emit('clientTick')
    assert.deepStrictEqual(starts, [['minecraft:ender_pearl', 2], ['minecraft:ender_pearl', 4]])
    assert.deepStrictEqual(ends, ['minecraft:ender_pearl'])
  })

  it('queries Items, numeric item IDs, names, groups and absent values', () => {
    const bot = create()
    const Item = require('prismarine-item')(bot.registry)
    const id = bot.registry.itemsByName.ender_pearl.id
    bot.receive('set_cooldown', { cooldownGroup: 'minecraft:ender_pearl', cooldownTicks: 12 })
    for (const value of [new Item(id, 1), id, 'ender_pearl', 'minecraft:ender_pearl', { type: id }]) {
      assert.strictEqual(bot.getItemCooldown(value), 12)
    }
    for (const value of [null, undefined, '', -1]) {
      assert.strictEqual(bot.getItemCooldownGroup(value), null)
      assert.strictEqual(bot.getItemCooldown(value), 0)
    }
    assert.strictEqual(bot.getItemCooldown('example:absent'), 0)
  })

  it('applies the default minecraft namespace used by vanilla Identifier decoding', () => {
    const bot = create()
    bot.receive('set_cooldown', { cooldownGroup: 'ender_pearl', cooldownTicks: 12 })
    assert.strictEqual(bot.getItemCooldown('minecraft:ender_pearl'), 12)
    const item = { name: 'apple', components: [{ type: 'minecraft:use_cooldown', data: { cooldownGroup: 'ender_pearl' } }] }
    assert.strictEqual(bot.getItemCooldown(item), 12)
  })

  it('resolves shared components from network slots and removal back to item defaults', () => {
    const bot = create()
    const Item = require('prismarine-item')(bot.registry)
    const items = ['ender_pearl', 'apple'].map(name => {
      const item = new Item(bot.registry.itemsByName[name].id, 1)
      item.components = [{ type: 'use_cooldown', data: { seconds: 2, cooldownGroup: 'example:shared' } }]
      return item
    })
    for (let i = 0; i < items.length; i++) {
      bot.receive('set_player_inventory', { slotId: i, contents: Item.toNotch(items[i]) })
    }
    bot.receive('set_cooldown', { cooldownGroup: 'example:shared', cooldownTicks: 40 })
    for (const slot of [36, 37]) assert.strictEqual(bot.getItemCooldown(bot.inventory.slots[slot]), 40)
    const removed = new Item(items[0].type, 1)
    removed.removedComponents = [{ type: 'use_cooldown' }]
    bot.receive('set_player_inventory', { slotId: 0, contents: Item.toNotch(removed) })
    assert.strictEqual(bot.getItemCooldownGroup(bot.inventory.slots[36]), 'minecraft:ender_pearl')
    assert.strictEqual(bot.getItemCooldown(bot.inventory.slots[36]), 0)
    bot.receive('set_cooldown', { cooldownGroup: 'example:shared', cooldownTicks: 0 })
    assert.strictEqual(bot.getItemCooldown(bot.inventory.slots[37]), 0)
  })

  it('does not complete consuming or stop using an item on cooldown updates', async () => {
    const bot = create()
    const Item = require('prismarine-item')(bot.registry)
    bot.quickBarSlot = 0
    bot.inventory.updateSlot(36, new Item(bot.registry.itemsByName.chorus_fruit.id, 1))
    let finished = false
    const consuming = bot.consume().then(() => { finished = true })
    for (const cooldownTicks of [20, 0]) {
      bot.receive('set_cooldown', { cooldownGroup: 'minecraft:chorus_fruit', cooldownTicks })
      await Promise.resolve()
      assert.strictEqual(finished, false)
      assert.strictEqual(bot.usingHeldItem, true)
    }
    bot._client.emit('entity_status', { entityId: bot.entity.id, entityStatus: 9 })
    await consuming
    assert.strictEqual(finished, true)
  })

  it('clears cooldowns at player and connection lifecycle boundaries', () => {
    const bot = create()
    for (const [emitter, event] of [[bot, 'login'], [bot, 'respawn'], [bot, 'end'], [bot._client, 'start_configuration']]) {
      bot.receive('set_cooldown', { cooldownGroup: 'minecraft:ender_pearl', cooldownTicks: 12 })
      emitter.emit(event)
      assert.strictEqual(bot.getItemCooldown('ender_pearl'), 0)
    }
  })

  it('decodes legacy itemID cooldown packets through inventory injection', () => {
    const bot = create('1.20.4')
    const item = bot.registry.itemsByName.ender_pearl
    bot.receive('set_cooldown', { itemID: item.id, cooldownTicks: 20 })
    for (const value of [item.id, item.name, `minecraft:${item.name}`, { type: item.id }]) {
      assert.strictEqual(bot.getItemCooldown(value), 20)
    }
    bot.receive('set_cooldown', { itemID: item.id, cooldownTicks: 0 })
    assert.strictEqual(bot.getItemCooldown(item.id), 0)
  })

  it('follows vanilla nonzero-duration handling even for a negative duration', () => {
    const bot = create()
    const events = []
    bot.on('itemCooldown', (group, ticks) => events.push(['start', group, ticks]))
    bot.on('itemCooldownEnd', group => events.push(['end', group]))
    bot.receive('set_cooldown', { cooldownGroup: 'example:negative', cooldownTicks: -1 })
    assert.strictEqual(bot.getItemCooldown('example:negative'), 0)
    bot.emit('clientTick')
    assert.deepStrictEqual(events, [['start', 'example:negative', -1], ['end', 'example:negative']])
  })

  for (const [physicsEnabled, loaded] of [[false, false], [true, false], [false, true]]) {
    it(`advances from the real physics timer (physicsEnabled=${physicsEnabled}, loaded=${loaded})`, async () => {
      const bot = create()
      bot.blockAt = () => loaded ? {} : null
      require('../lib/plugins/physics')(bot, { physicsEnabled })
      let ticks = 0
      let simulations = 0
      bot.on('clientTick', () => ticks++)
      bot.on('physicsTick', () => simulations++)
      bot.receive('set_cooldown', { cooldownGroup: 'minecraft:ender_pearl', cooldownTicks: 2 })
      const expiry = new Promise(resolve => bot.once('itemCooldownEnd', resolve))
      bot.emit('login')
      // Login resets player state, so the packet must follow it.
      bot.receive('set_cooldown', { cooldownGroup: 'minecraft:ender_pearl', cooldownTicks: 2 })
      try {
        assert.strictEqual(await expiry, 'minecraft:ender_pearl')
        assert.strictEqual(ticks, 2)
        assert.strictEqual(simulations, 0)
        assert.strictEqual(bot.getItemCooldown('ender_pearl'), 0)
        bot._client.state = 'configuration'
        await new Promise(resolve => setTimeout(resolve, 110))
        assert.strictEqual(ticks, 2)
      } finally {
        bot.emit('end')
      }
    })
  }
})
