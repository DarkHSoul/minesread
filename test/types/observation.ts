import { Bot, EntityDamage } from '../..'
import { Item } from 'prismarine-item'

declare const bot: Bot
declare const item: Item
const ticks: number = bot.getItemCooldown(item)
const group: string | null = bot.getItemCooldownGroup(item)
bot.getItemCooldown('minecraft:ender_pearl')
bot.getItemCooldown(1)
bot.getItemCooldown(null)
bot.on('entityDamage', (damage: EntityDamage) => {
  const name: string | undefined = damage.sourceType
  const cause: number | null = damage.sourceCauseId
  damage.sourcePosition?.distanceTo(bot.entity.position)
  damage.sourceDirect?.position.distanceTo(bot.entity.position)
  void name
  void cause
})
bot.on('entityHurt', (entity, source) => {
  entity?.position.distanceTo(bot.entity.position)
  source?.position.distanceTo(bot.entity.position)
})
bot.on('itemCooldown', (group, ticks) => { group.toUpperCase(); ticks.toFixed() })
bot.on('itemCooldownEnd', group => { group.toUpperCase() })
bot.on('chunkBiomesUpdate', corner => { corner.floored() })
bot.on('clientTick', () => {})
void ticks
void group
