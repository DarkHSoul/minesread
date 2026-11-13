const { attributeValue } = require('../combat_attributes')
module.exports = function inject (bot) {
  let attackTicks = 0
  let swapTicks = 0
  let itemType = bot.heldItem?.type ?? null
  const reset = () => { attackTicks = swapTicks = 0 }
  bot.on('spawn', reset)
  bot.on('clientTick', () => {
    attackTicks++
    swapTicks++
    const next = bot.heldItem?.type ?? null
    if (next !== itemType) reset()
    itemType = next
  })
  bot.getAttackStrengthDelay = () => {
    const speed = attributeValue(bot.entity?.attributes, ['minecraft:attack_speed', 'attack_speed', 'generic.attack_speed', 'generic.attackSpeed'])
    return speed === null ? null : Math.fround(20 / Math.max(0, Math.min(1024, speed)))
  }
  const scale = (ticks, partialTick) => {
    if (!Number.isFinite(partialTick)) throw new TypeError('partialTick must be finite')
    const delay = bot.getAttackStrengthDelay()
    return delay === null ? null : Math.max(0, Math.min(1, Math.fround(Math.fround(ticks + partialTick) / delay)))
  }
  bot.getAttackStrengthScale = (partialTick = 0) => scale(attackTicks, partialTick)
  bot.getItemSwapScale = (partialTick = 0) => scale(swapTicks, partialTick)
  bot.getAttackCooldownTicks = () => {
    const delay = bot.getAttackStrengthDelay()
    return delay === null ? null : Math.max(0, Math.ceil(delay - attackTicks))
  }
  const attack = bot.attack
  if (typeof attack === 'function') {
    bot.attack = function (...args) {
      const result = attack.apply(this, args)
      reset()
      return result
    }
  }
}
