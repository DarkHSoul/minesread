module.exports = inject

function inject (bot) {
  const advancements = bot.advancements = new Map()
  bot.getAdvancement = id => advancements.get(id) ?? null
  bot.getAdvancements = () => Array.from(advancements.values())
  bot.isAdvancementDone = id => advancements.get(id)?.completed ?? null

  const clear = () => {
    advancements.clear()
    bot.emit('advancementsReset')
  }
  bot.on('login', clear)
  bot.on('end', clear)
  bot._client.on('start_configuration', clear)

  function entry (id) {
    if (!advancements.has(id)) advancements.set(id, { id, definition: null, progress: null, completed: null })
    return advancements.get(id)
  }

  function hasParents (state, visited = new Set()) {
    if (!state?.definition || visited.has(state.id)) return false
    visited.add(state.id)
    const parent = state.definition.value.parentId
    return !parent || hasParents(advancements.get(parent), visited)
  }

  function completion (state) {
    const requirements = state.definition?.value.requirements
    if (!hasParents(state) || !Array.isArray(requirements) || state.progress === null) return null
    const obtained = new Set(state.progress.filter(c => c.criterionProgress != null).map(c => c.criterionIdentifier))
    // AND of OR groups; the empty outer list is explicitly false in vanilla.
    return requirements.length > 0 && requirements.every(group => group.some(id => obtained.has(id)))
  }

  bot._client.on('advancements', packet => {
    if (packet.reset) {
      advancements.clear()
      bot.emit('advancementsReset')
    }
    // The tree removes descendants recursively, even when only a root is sent.
    const removed = new Set(packet.identifiers || [])
    let changed = true
    while (changed) {
      changed = false
      for (const state of advancements.values()) {
        if (!removed.has(state.id) && removed.has(state.definition?.value.parentId)) {
          removed.add(state.id)
          changed = true
        }
      }
    }
    for (const id of removed) {
      const state = advancements.get(id)
      advancements.delete(id)
      if (state) bot.emit('advancementRemoved', id, state)
    }
    const touched = new Set()
    for (const definition of packet.advancementMapping || []) {
      entry(definition.key).definition = definition
      touched.add(definition.key)
    }
    for (const progress of packet.progressMapping || []) {
      // Each progress value replaces that advancement's criteria snapshot.
      // Other advancements' progress is retained. Keep unknown IDs as unknown.
      entry(progress.key).progress = progress.value
      touched.add(progress.key)
    }
    for (const state of advancements.values()) {
      const previous = state.completed
      state.completed = completion(state)
      if (touched.has(state.id) || previous !== state.completed) bot.emit('advancementUpdate', state, previous)
      if (!packet.reset && state.completed === true && previous !== true) bot.emit('advancementCompleted', state)
    }
    bot.emit('advancementsUpdated', packet)
  })
}
