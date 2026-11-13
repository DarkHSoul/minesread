const { namedMetadata, entityState, dragonPhase } = require('../entity_observation')
const { DragonFlightHistory, createParts, updateParts } = require('../dragon_parts')

module.exports = function inject (bot) {
  let states = new WeakMap()
  const retired = new WeakSet()
  const histories = new Map()
  let worldName
  bot.entityParts = new Map()
  const supported = () => bot.version === '26.3'
  const resolve = entity => typeof entity === 'number' ? bot.entities[entity] : entity
  bot.getEntityMetadata = entity => {
    entity = resolve(entity)
    return entity ? namedMetadata(entity, bot.registry) : undefined
  }
  bot.getEntityState = entity => {
    entity = resolve(entity)
    return entity ? entityState(entity, bot.getEntityMetadata(entity), supported()) : undefined
  }
  bot.getDragonPhase = entity => {
    entity = resolve(entity)
    return supported() && entity?.name === 'ender_dragon' ? dragonPhase(bot.getEntityMetadata(entity)) : undefined
  }
  bot.getEntityParts = entity => {
    entity = resolve(entity)
    if (!supported() || entity?.name !== 'ender_dragon' || retired.has(entity)) return []
    let parts = bot.entityParts.get(entity.id)
    if (!parts || parts[0].parent !== entity) {
      if (parts) {
        for (const part of parts) { part.initialized = false; part.position = null }
        retired.add(parts[0].parent)
      }
      parts = createParts(entity)
      bot.entityParts.set(entity.id, parts)
      histories.set(entity.id, new DragonFlightHistory())
      updateParts(parts, histories.get(entity.id), bot.getDragonPhase(entity))
    }
    return parts
  }
  const update = entity => {
    const previous = states.get(entity)
    const state = bot.getEntityState(entity)
    states.set(entity, state)
    bot.emit('entityStateUpdate', entity, state, previous)
    const parts = bot.getEntityParts(entity)
    if (parts.length && updateParts(parts, histories.get(entity.id), bot.getDragonPhase(entity))) bot.emit('entityPartsUpdate', entity, parts)
  }
  bot.on('entitySpawn', entity => {
    retired.delete(entity)
    update(entity)
  })
  bot.on('entityUpdate', update)
  bot.on('entityMoved', entity => {
    const parts = bot.getEntityParts(entity)
    if (parts.length && updateParts(parts, histories.get(entity.id), bot.getDragonPhase(entity))) bot.emit('entityPartsUpdate', entity, parts)
  })
  bot.on('clientTick', () => {
    for (const [id, parts] of bot.entityParts) {
      if (updateParts(parts, histories.get(id), bot.getDragonPhase(parts[0].parent), true)) bot.emit('entityPartsUpdate', parts[0].parent, parts)
    }
  })
  bot.on('entityGone', entity => {
    states.delete(entity)
    retired.add(entity)
    if (bot.entityParts.get(entity.id)?.[0].parent !== entity) return
    for (const part of bot.entityParts.get(entity.id)) { part.initialized = false; part.position = null }
    bot.entityParts.delete(entity.id)
    histories.delete(entity.id)
  })
  const clear = () => {
    states = new WeakMap()
    for (const parts of bot.entityParts.values()) {
      retired.add(parts[0].parent)
      for (const part of parts) { part.initialized = false; part.position = null }
    }
    bot.entityParts.clear()
    histories.clear()
  }
  bot._client.on('login', packet => { worldName = packet.worldState?.name })
  bot._client.on('respawn', packet => {
    const nextWorld = packet.worldState?.name
    // Vanilla retains the ClientLevel (and its dragons) on same-world respawn.
    // Retiring those parents would leave them unusable without a new spawn.
    if (nextWorld === undefined || nextWorld !== worldName) clear()
    worldName = nextWorld
  })
  for (const event of ['start_configuration', 'end']) {
    bot._client.on(event, () => { clear(); worldName = undefined })
  }
  bot.on('login', clear)
}
