const assert = require('assert')
const { onceWithCleanup } = require('../promise_utils')

module.exports = inject

function inject (bot) {
  const Item = require('prismarine-item')(bot.registry)
  const Recipe = require('prismarine-recipe')(bot.registry).Recipe
  let windowCraftingTable

  async function craft (recipe, count, craftingTable) {
    assert.ok(recipe)
    count = Number(count ?? 1)
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('craft count must be a positive integer')
    if (!craftingTable && bot.currentWindow) throw new Error('Close the current window before inventory crafting')
    if (recipe.requiresTable && !craftingTable) {
      throw new Error('Recipe requires craftingTable, but one was not supplied: ' + JSON.stringify(recipe))
    }

    try {
      for (let i = 0; i < count; i++) {
        await craftOnce(recipe, craftingTable)
      }

      if (windowCraftingTable) {
        // The last put-away click is unconfirmed; closing on a wrong model
        // leaves items the server never placed.
        await bot._syncWindow(windowCraftingTable)
        await bot.closeWindow(windowCraftingTable)
        windowCraftingTable = undefined
      }
    } catch (err) {
      if (windowCraftingTable) {
        try {
          await bot.closeWindow(windowCraftingTable)
        } catch {}
        windowCraftingTable = undefined
      }
      throw new Error(err)
    }
  }

  async function craftOnce (recipe, craftingTable) {
    if (craftingTable) {
      if (!windowCraftingTable) {
        const controller = new AbortController()
        const opened = onceWithCleanup(bot, 'windowOpen', { timeout: 20000, signal: controller.signal })
        try {
          await bot.activateBlock(craftingTable)
          const [window] = await opened
          windowCraftingTable = window
        } finally {
          controller.abort()
        }
      }
      if (!windowCraftingTable.type.startsWith('minecraft:crafting')) {
        throw new Error('crafting: non craftingTable used as craftingTable: ' + windowCraftingTable.type)
      }
      await startClicking(windowCraftingTable, 3, 3)
    } else {
      await startClicking(bot.inventory, 2, 2)
    }

    async function startClicking (window, w, h) {
      // Existing inputs affect recipe matching, including nominally empty cells.
      for (let i = 1; i <= w * h; i++) {
        if (window.slots[i]) await bot.putAway(i)
      }
      const extraSlots = unusedRecipeSlots()
      let ingredientIndex = 0
      let originalSourceSlot = null
      let it
      if (recipe.inShape) {
        it = {
          x: 0,
          y: 0,
          row: recipe.inShape[0]
        }
        await clickShape()
      } else {
        await nextIngredientsClick()
      }

      function incrementShapeIterator () {
        it.x += 1
        if (it.x >= it.row.length) {
          it.y += 1
          if (it.y >= recipe.inShape.length) return null
          it.x = 0
          it.row = recipe.inShape[it.y]
        }
        return it
      }

      async function nextShapeClick () {
        if (incrementShapeIterator()) {
          await clickShape()
        } else if (!recipe.ingredients) {
          await putMaterialsAway()
        } else {
          await nextIngredientsClick()
        }
      }

      async function clickShape () {
        const destSlot = slot(it.x, it.y)
        const ingredient = it.row[it.x]
        if (ingredient.id === -1) return nextShapeClick()
        if (!window.selectedItem || window.selectedItem.type !== ingredient.id ||
          (ingredient.metadata != null &&
            window.selectedItem.metadata !== ingredient.metadata)) {
          // we are not holding the item we need. click it.
          const sourceItem = window.findInventoryItem(ingredient.id, ingredient.metadata)
          if (!sourceItem) throw new Error('missing ingredient')
          if (originalSourceSlot == null) originalSourceSlot = sourceItem.slot
          await bot.clickWindow(sourceItem.slot, 0, 0)
        }
        await bot.clickWindow(destSlot, 1, 0)
        await nextShapeClick()
      }

      async function nextIngredientsClick () {
        const ingredient = recipe.ingredients[ingredientIndex]
        const destSlot = extraSlots.pop()
        if (!window.selectedItem || window.selectedItem.type !== ingredient.id ||
          (ingredient.metadata != null &&
            window.selectedItem.metadata !== ingredient.metadata)) {
          // we are not holding the item we need. click it.
          const sourceItem = window.findInventoryItem(ingredient.id, ingredient.metadata)
          if (!sourceItem) throw new Error('missing ingredient')
          if (originalSourceSlot == null) originalSourceSlot = sourceItem.slot
          await bot.clickWindow(sourceItem.slot, 0, 0)
        }
        await bot.clickWindow(destSlot, 1, 0)
        if (++ingredientIndex < recipe.ingredients.length) {
          await nextIngredientsClick()
        } else {
          await putMaterialsAway()
        }
      }

      async function putMaterialsAway () {
        const start = window.inventoryStart
        const end = window.inventoryEnd
        await bot.putSelectedItemRange(start, end, window, originalSourceSlot)
        await grabResult()
      }

      async function grabResult () {
        assert.strictEqual(window.selectedItem, null)
        if (bot.supportFeature('stateIdUsed')) {
          // Recipe results and remainders may carry server-defined components.
          // A static recipe is a placement plan, not authority to create items.
          await bot._syncWindow(window)
          if (!window.slots[0]) throw new Error('Server rejected crafting recipe: no result')
          if (window.slots[0].type !== recipe.result.id) throw new Error('Server returned an unexpected crafting result')
          await bot.putAway(0)
          await bot._syncWindow(window)
          for (let i = 1; i <= w * h; i++) {
            if (window.slots[i]) await bot.putAway(i)
          }
          await bot._syncWindow(window)
          return
        }
        // Causes a double-emit on 1.12+ --nickelpro
        // put the recipe result in the output
        const item = new Item(recipe.result.id, recipe.result.count, recipe.result.metadata)
        window.updateSlot(0, item)
        await bot.putAway(0)
        await updateOutShape()
      }

      async function updateOutShape () {
        if (!recipe.outShape) {
          for (let i = 1; i <= w * h; i++) {
            window.updateSlot(i, null)
          }
          return
        }
        const slotsToClick = []
        for (let y = 0; y < recipe.outShape.length; ++y) {
          const row = recipe.outShape[y]
          for (let x = 0; x < row.length; ++x) {
            const _slot = slot(x, y)
            let item = null
            if (row[x].id !== -1) {
              item = new Item(row[x].id, row[x].count, row[x].metadata || null)
              slotsToClick.push(_slot)
            }
            window.updateSlot(_slot, item)
          }
        }
        for (const _slot of slotsToClick) {
          await bot.putAway(_slot)
        }
      }

      function slot (x, y) {
        return 1 + x + w * y
      }

      function unusedRecipeSlots () {
        const result = []
        let x
        let y
        let row
        if (recipe.inShape) {
          for (y = 0; y < recipe.inShape.length; ++y) {
            row = recipe.inShape[y]
            for (x = 0; x < row.length; ++x) {
              if (row[x].id === -1) result.push(slot(x, y))
            }
            for (; x < w; ++x) {
              result.push(slot(x, y))
            }
          }
          for (; y < h; ++y) {
            for (x = 0; x < w; ++x) {
              result.push(slot(x, y))
            }
          }
        } else {
          for (y = 0; y < h; ++y) {
            for (x = 0; x < w; ++x) {
              result.push(slot(x, y))
            }
          }
        }
        return result
      }
    }
  }

  function recipesFor (itemType, metadata, minResultCount, craftingTable) {
    minResultCount = minResultCount ?? 1
    const results = []
    Recipe.find(itemType, metadata).forEach((recipe) => {
      if (requirementsMetForRecipe(recipe, minResultCount, craftingTable)) {
        results.push(recipe)
      }
    })
    return results
  }

  function recipesAll (itemType, metadata, craftingTable) {
    const results = []
    Recipe.find(itemType, metadata).forEach((recipe) => {
      if (!recipe.requiresTable || craftingTable) {
        results.push(recipe)
      }
    })
    return results
  }

  function requirementsMetForRecipe (recipe, minResultCount, craftingTable) {
    if (recipe.requiresTable && !craftingTable) return false

    // how many times we have to perform the craft to achieve minResultCount
    const craftCount = Math.ceil(minResultCount / recipe.result.count)

    // false if not enough inventory to make all the ones that we want
    for (let i = 0; i < recipe.delta.length; ++i) {
      const d = recipe.delta[i]
      if (bot.inventory.count(d.id, d.metadata) + d.count * craftCount < 0) return false
    }

    // otherwise true
    return true
  }

  // Display IDs are session-local numeric IDs, not static recipe names. This
  // sends a placement request only; the server can reject it or send a ghost.
  bot.requestRecipePlacement = (displayId, makeAll = false) => {
    if (!bot.registry.version['>=']('1.21.2')) throw new Error('Numeric recipe display placement requires 1.21.2+')
    if (!Number.isSafeInteger(displayId) || displayId < 0 || displayId > 0x7fffffff) throw new Error('Invalid recipe display ID')
    if (typeof makeAll !== 'boolean') throw new Error('makeAll must be a boolean')
    if (!bot.getServerRecipe?.(displayId)) throw new Error('Unknown server recipe display ID')
    const window = bot.currentWindow || bot.inventory
    if (!['minecraft:inventory', 'minecraft:crafting', 'minecraft:crafting_table'].includes(window.type)) throw new Error('Recipe placement requires a crafting window')
    bot._client.write('craft_recipe_request', { windowId: window.id, recipeId: displayId, makeAll })
  }
  bot._client.on('craft_recipe_response', packet => bot.emit('recipePlacementGhost', packet))

  bot.craft = craft
  bot.recipesFor = recipesFor
  bot.recipesAll = recipesAll
}
