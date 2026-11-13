// ItemCooldowns / ClientPacketListener.handleItemCooldown in Mojang 26.3.
module.exports = function injectCooldowns (bot) {
  const cooldowns = new Map()
  let tick = 0
  const modern = bot.registry.version['>=']('1.21.2')
  const identifier = value => value.includes(':') ? value : `minecraft:${value}`
  bot.getItemCooldownGroup = (item) => {
    if (item === '') return null
    if (typeof item === 'string') {
      if (modern || item.startsWith('item:')) return identifier(item)
      item = bot.registry.itemsByName[item.replace(/^minecraft:/, '')]
    }
    if (typeof item === 'number') item = bot.registry.items[item]
    if (!item) return null
    if (!modern) {
      const id = item.type ?? item.id
      return Number.isInteger(id) ? `item:${id}` : null
    }
    const isCooldown = c => (typeof c === 'string' ? c : c.type)?.replace(/^minecraft:/, '') === 'use_cooldown'
    // Components on prismarine-item are a patch, not the effective defaults.
    // Vanilla's default use_cooldown components have no custom group, so both
    // an absent component and an explicitly removed component use the item ID.
    const removed = item.removedComponents?.some(isCooldown)
    const component = removed ? null : item.components?.find(isCooldown)
    const group = component?.data?.cooldownGroup
    const name = item.name ?? bot.registry.items[item.type ?? item.id]?.name
    return group ? identifier(group) : name ? identifier(name) : null
  }
  bot.getItemCooldown = (item) => {
    const group = bot.getItemCooldownGroup(item)
    return Math.max(0, (cooldowns.get(group) ?? tick) - tick)
  }
  function remove (group) {
    if (cooldowns.delete(group)) bot.emit('itemCooldownEnd', group)
  }
  bot._client.on('set_cooldown', packet => {
    const group = packet.cooldownGroup != null ? identifier(packet.cooldownGroup) : `item:${packet.itemID}`
    if (packet.cooldownTicks !== 0) {
      cooldowns.set(group, tick + packet.cooldownTicks)
      bot.emit('itemCooldown', group, packet.cooldownTicks)
    } else remove(group)
  })
  bot.on('clientTick', () => {
    tick++
    for (const [group, end] of cooldowns) if (end <= tick) remove(group)
  })
  const reset = () => { cooldowns.clear(); tick = 0 }
  bot.on('login', reset)
  bot.on('respawn', reset)
  bot._client.on('respawn', reset)
  bot._client.on('start_configuration', reset)
  bot.on('end', reset)
}
