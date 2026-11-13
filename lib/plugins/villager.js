const assert = require('assert')
const { isDeepStrictEqual } = require('util')
const { once } = require('../promise_utils')
const { matchesComponentPredicate, getItemStackSize } = require('../item_components')

module.exports = inject

function inject (bot, { version }) {
  const { entitiesByName } = bot.registry
  const Item = require('prismarine-item')(bot.registry)

  let selectTrade
  if (bot.supportFeature('useMCTrSel')) {
    bot._client.registerChannel('MC|TrSel', 'i32')
    selectTrade = (choice) => {
      bot._client.writeChannel('MC|TrSel', choice)
    }
  } else {
    selectTrade = (choice) => {
      bot._client.write('select_trade', { slot: choice })
    }
  }

  const tradeListSchema = [
    'container',
    [
      { type: 'i32', name: 'windowId' },
      {
        name: 'trades',
        type: [
          'array',
          {
            countType: 'i8',
            type: [
              'container',
              [
                { type: 'slot', name: 'inputItem1' },
                { type: 'slot', name: 'outputItem' },
                { type: 'bool', name: 'hasItem2' },
                {
                  name: 'inputItem2',
                  type: [
                    'switch',
                    {
                      compareTo: 'hasItem2',
                      fields: {
                        true: 'slot',
                        false: 'void'
                      }
                    }
                  ]
                },
                { type: 'bool', name: 'tradeDisabled' },
                { type: 'i32', name: 'nbTradeUses' },
                { type: 'i32', name: 'maximumNbTradeUses' }
              ]
            ]
          }]
      }
    ]
  ]

  let tradeListPacket
  if (bot.supportFeature('useMCTrList')) {
    tradeListPacket = 'MC|TrList'
    bot._client.registerChannel('MC|TrList', tradeListSchema)
  } else if (bot.supportFeature('usetraderlist')) {
    tradeListPacket = 'minecraft:trader_list'
    bot._client.registerChannel('minecraft:trader_list', tradeListSchema)
  } else {
    tradeListPacket = 'trade_list'
  }

  async function openVillager (villagerEntity) {
    const villagerType = entitiesByName.villager ? entitiesByName.villager.id : entitiesByName.Villager.id
    const wanderingTraderType = entitiesByName.wandering_trader?.id
    assert.ok(villagerEntity.entityType === villagerType || (wanderingTraderType !== undefined && villagerEntity.entityType === wanderingTraderType), 'Expected a villager or wandering trader')
    let ready = false

    // Subscribe before interaction: a fast server can send offers immediately.
    bot._client.on(tradeListPacket, gotTrades)
    const villagerPromise = Promise.resolve().then(() => bot.openEntity(villagerEntity))
    let villager
    try {
      villager = await villagerPromise
    } catch (err) {
      bot._client.removeListener(tradeListPacket, gotTrades)
      throw err
    }
    if (villager.type !== 'minecraft:villager' && villager.type !== 'minecraft:merchant') {
      bot._client.removeListener(tradeListPacket, gotTrades)
      throw new Error('Expected minecraft:villager or minecraft:merchant type, but got ' + villager.type)
    }

    villager.trades = null
    villager.selectedTrade = null

    villager.once('close', () => {
      bot._client.removeListener(tradeListPacket, gotTrades)
    })

    villager.trade = async (index, count) => {
      await bot.trade(villager, index, count)
    }

    if (!ready) {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer)
          villager.removeListener('ready', onReady)
          villager.removeListener('close', onClose)
        }
        const onReady = () => { cleanup(); resolve() }
        const onClose = () => { cleanup(); reject(new Error('Merchant closed before offers arrived')) }
        const timer = setTimeout(() => {
          cleanup()
          bot._client.removeListener(tradeListPacket, gotTrades)
          reject(new Error('Timed out waiting for merchant offers'))
        }, 20000)
        villager.once('ready', onReady)
        villager.once('close', onClose)
      })
    }
    return villager

    async function gotTrades (packet) {
      let villager
      try { villager = await villagerPromise } catch { return }
      if (packet.windowId !== villager.id) return
      assert.ok(packet.trades)
      const selectedIndex = villager.trades?.indexOf(villager.selectedTrade) ?? -1
      villager.trades = packet.trades.map(rawTrade => {
        const trade = { ...rawTrade }
        trade.inputs = [trade.inputItem1 = readCost(trade.inputItem1)]
        trade.inputItem2 = readCost(trade.inputItem2)
        if (trade.inputItem2) trade.inputs.push(trade.inputItem2)
        trade.hasItem2 = !!trade.inputItem2
        trade.outputs = [trade.outputItem = Item.fromNotch(trade.outputItem || { blockId: -1 })]

        if (trade.demand !== undefined && trade.specialPrice !== undefined) { // the price is affected by demand and reputation
          const demandDiff = Math.max(0, Math.floor(Math.fround(Math.fround(Math.imul(trade.inputItem1.count, trade.demand)) * trade.priceMultiplier)))
          trade.realPrice = Math.min(Math.max((trade.inputItem1.count + trade.specialPrice + demandDiff), 1), getItemStackSize(bot.registry, trade.inputItem1))
        } else {
          trade.realPrice = trade.inputItem1.count
        }
        return trade
      })
      if (selectedIndex >= 0) villager.selectedTrade = villager.trades[selectedIndex] ?? null
      for (const key of ['villagerLevel', 'experience', 'isRegularVillager', 'canRestock']) {
        if (packet[key] !== undefined) villager[key] = packet[key]
      }
      villager.emit('tradesUpdated', villager.trades)
      if (!ready) {
        ready = true
        villager.emit('ready')
      }
    }
  }

  async function trade (villager, index, count) {
    assert.strictEqual(bot.currentWindow, villager, 'Merchant window is not open')
    const choice = typeof index === 'string' && index.trim() !== '' ? Number(index) : index
    assert.ok(Number.isInteger(choice) && choice >= 0, 'Invalid trade index')
    assert.ok(Array.isArray(villager.trades) && villager.trades[choice], 'Invalid trade index')
    const Trade = villager.trades[choice]
    villager.selectedTrade = Trade
    count = count ?? Trade.maximumNbTradeUses - Trade.nbTradeUses
    assert.ok(Number.isInteger(count) && count >= 0, 'Invalid trade count')
    if (count === 0) return
    assert.ok(!Trade.tradeDisabled, 'trade blocked')
    assert.ok(Trade.maximumNbTradeUses - Trade.nbTradeUses > 0, 'trade blocked')
    assert.ok(Trade.maximumNbTradeUses - Trade.nbTradeUses >= count)

    const itemCount1 = countCost(villager, Trade.inputItem1)
    const hasEnoughItem1 = itemCount1 >= Trade.realPrice * count
    let hasEnoughItem2 = true
    let itemCount2 = 0
    if (Trade.hasItem2) {
      itemCount2 = countCost(villager, Trade.inputItem2)
      hasEnoughItem2 = itemCount2 >= Trade.inputItem2.count * count
    }
    if (!hasEnoughItem1) {
      throw new Error('Not enough item 1 to trade')
    }
    if (!hasEnoughItem2) {
      throw new Error('Not enough item 2 to trade')
    }
    if (Trade.hasItem2) {
      const available = villager.slots.reduce((total, item, slot) => {
        const usable = (slot < 2 || (slot >= villager.inventoryStart && slot < villager.inventoryEnd)) &&
          (matchesCost(item, Trade.inputItem1) || matchesCost(item, Trade.inputItem2))
        return total + (usable ? item.count : 0)
      }, 0)
      if (available < (Trade.realPrice + Trade.inputItem2.count) * count) {
        throw new Error('Not enough items for both trade costs')
      }
    }

    if (bot.supportFeature('stateIdUsed')) {
      selectTrade(choice)
      await bot._syncWindow(villager)
    } else if (bot.supportFeature('selectingTradeMovesItems')) { // 1.14+ the server moves items around by itself after selecting a trade
      const proms = []
      proms.push(once(villager, 'updateSlot:0'))
      if (Trade.hasItem2) proms.push(once(villager, 'updateSlot:1'))
      if (bot.supportFeature('setSlotAsTransaction')) {
        proms.push(once(villager, 'updateSlot:2'))
      }
      selectTrade(choice)
      await Promise.all(proms)
    } else {
      selectTrade(choice)
    }

    for (let i = 0; i < count; i++) {
      await putRequirements(villager, Trade)
      if (!bot.supportFeature('setSlotAsTransaction')) {
        villager.updateSlot(2, Object.assign({}, Trade.outputItem))

        const [slot1, slot2] = villager.slots
        if (slot1) {
          assert.strictEqual(slot1.type, Trade.inputItem1.type)
          const updatedCount1 = slot1.count - Trade.realPrice
          const updatedSlot1 = updatedCount1 <= 0
            ? null
            : { ...slot1, count: updatedCount1 }
          villager.updateSlot(0, updatedSlot1)
        }

        if (slot2) {
          assert.strictEqual(slot2.type, Trade.inputItem2.type)
          const updatedCount2 = slot2.count - Trade.inputItem2.count
          const updatedSlot2 = updatedCount2 <= 0
            ? null
            : { ...slot2, count: updatedCount2 }
          villager.updateSlot(1, updatedSlot2)
        }
      }

      if (bot.supportFeature('stateIdUsed')) {
        assert.ok(matchesCost(villager.slots[2], Trade.outputItem) && villager.slots[2].count >= Trade.outputItem.count, 'Merchant did not provide the expected output')
      }
      const paymentBefore = [villager.slots[0]?.count ?? 0, villager.slots[1]?.count ?? 0]
      if (bot.supportFeature('selectingTradeMovesItems')) {
        await bot.putAway(2)
      } else {
        // A shift click on the output trades again while the inputs still cover the price.
        await bot.clickWindow(2, 0, 1)
      }
      if (bot.supportFeature('stateIdUsed')) {
        assert.ok(paymentBefore[0] - (villager.slots[0]?.count ?? 0) >= Trade.realPrice, 'Merchant did not consume payment')
        if (Trade.hasItem2) assert.ok(paymentBefore[1] - (villager.slots[1]?.count ?? 0) >= Trade.inputItem2.count, 'Merchant did not consume second payment')
      }
      Trade.nbTradeUses++
      if (Trade.nbTradeUses >= Trade.maximumNbTradeUses) Trade.tradeDisabled = true
    }

    for (const i of [0, 1]) {
      if (villager.slots[i]) {
        await bot.putAway(i) // 1.14+ whole stacks of items will automatically be placed , so there might be some left over
      }
    }
  }

  async function putRequirements (window, Trade) {
    for (const [slot, cost] of [[0, Trade.inputItem1], [1, Trade.inputItem2]]) {
      if (window.slots[slot] && (!cost || !matchesCost(window.slots[slot], cost))) await bot.putAway(slot)
    }
    const [slot1, slot2] = window.slots
    const { type: type1, metadata: metadata1 } = Trade.inputItem1

    const input1 = slot1
      ? Math.max(0, Trade.realPrice - slot1.count)
      : Trade.realPrice
    if (input1) {
      await deposit(window, type1, metadata1, input1, 0, Trade.inputItem1)
    }
    if (Trade.hasItem2) {
      const { count: tradeCount2, type: type2, metadata: metadata2 } = Trade.inputItem2

      const input2 = slot2
        ? Math.max(0, tradeCount2 - slot2.count)
        : tradeCount2
      if (input2) {
        await deposit(window, type2, metadata2, input2, 1, Trade.inputItem2)
      }
    }
  }

  function readCost (cost) {
    if (!cost || cost.itemCount === 0 || cost.present === false || cost.blockId === -1) return null
    // ItemCost carries an exact component predicate, not an ItemStack patch.
    return Item.fromNotch({ ...cost, removeComponents: cost.removeComponents ?? [] })
  }

  function matchesCost (item, cost) {
    if (!item || item.type !== cost.type || item.metadata !== cost.metadata) return false
    if (bot.supportFeature('itemsWithComponents')) {
      return matchesComponentPredicate(bot.registry, item, cost.components)
    }
    return cost.nbt == null || isDeepStrictEqual(item.nbt, cost.nbt)
  }

  function countCost (window, cost) {
    // Include the two payment slots, but never count the merchant's output.
    return window.slots.reduce((total, item, slot) => total + ((slot < 2 || (slot >= window.inventoryStart && slot < window.inventoryEnd)) && matchesCost(item, cost) ? item.count : 0), 0)
  }

  async function deposit (window, itemType, metadata, count, slot, cost) {
    const options = {
      window,
      itemType,
      metadata,
      itemMatcher: item => matchesCost(item, cost),
      count,
      sourceStart: window.inventoryStart,
      sourceEnd: window.inventoryEnd,
      destStart: slot,
      destEnd: slot + 1
    }
    await bot.transfer(options)
  }

  bot.openVillager = openVillager
  bot.trade = trade
}
