import { Bot, ItemComponentResolution } from '../..'
declare const bot: Bot
const component: ItemComponentResolution = bot.getItemComponent(bot.heldItem, 'minecraft:food')
if (component.known && component.present) {
  const value: unknown = component.value
  void value
}
if (bot.heldItem) {
  bot.getItemStackSize(bot.heldItem).toFixed()
  bot.getItemDamage(bot.heldItem)?.toFixed()
  bot.getItemMaxDurability(bot.heldItem)?.toFixed()
}
