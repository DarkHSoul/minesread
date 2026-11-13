module.exports = inject

// This is the server's display book, separate from the static crafting database.
function inject (bot) {
  const state = bot.serverRecipes = {
    displays: new Map(),
    highlighted: new Set(),
    properties: new Map(),
    stonecutterRecipes: [],
    bookSettings: null,
    received: false
  }
  bot.getServerRecipe = displayId => state.displays.get(displayId) ?? null
  bot.getServerRecipes = () => Array.from(state.displays.values())

  function clear () {
    state.displays.clear()
    state.highlighted.clear()
    state.properties.clear()
    state.stonecutterRecipes = []
    state.bookSettings = null
    state.received = false
  }
  bot.on('login', clear)
  bot.on('end', clear)
  bot._client.on('start_configuration', clear)

  bot._client.on('declare_recipes', packet => {
    // Older protocols transmit full recipes with a different structure. Do not
    // mislabel their recipe resource IDs as display IDs or property set names.
    if (!Array.isArray(packet.stoneCutterRecipes)) return
    state.properties.clear()
    for (const property of packet.recipes) state.properties.set(property.name, property.items)
    state.stonecutterRecipes = packet.stoneCutterRecipes
    state.received = true
    bot.emit('serverRecipesUpdated', packet)
  })
  bot._client.on('recipe_book_add', packet => {
    if (!Array.isArray(packet.entries)) return
    if (packet.replace) {
      state.displays.clear()
      state.highlighted.clear()
    }
    for (const entry of packet.entries) {
      const id = entry.recipe.displayId
      state.displays.set(id, entry)
      if (entry.flags?.highlight) state.highlighted.add(id)
      bot.emit('serverRecipeAdded', entry)
      if (entry.flags?.notification) bot.emit('serverRecipeNotification', entry)
    }
    bot.emit('serverRecipesUpdated', packet)
  })
  bot._client.on('recipe_book_remove', packet => {
    for (const id of packet.recipeIds || []) {
      const entry = state.displays.get(id)
      state.displays.delete(id)
      state.highlighted.delete(id)
      if (entry) bot.emit('serverRecipeRemoved', id, entry)
    }
    bot.emit('serverRecipesUpdated', packet)
  })
  bot._client.on('recipe_book_settings', packet => {
    state.bookSettings = packet
    bot.emit('recipeBookSettings', packet)
  })
}
