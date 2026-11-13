import { Bot, TransferOptions, Villager } from '../..'

declare const bot: Bot
declare const transfer: TransferOptions
bot.requestRecipePlacement(1)
bot.requestRecipePlacement(1, true)
bot.on('recipePlacementGhost', packet => {
  packet.windowId.toFixed()
  packet.recipeDisplay?.type.toLowerCase()
})
bot.transfer({ ...transfer, itemMatcher: item => item.count > 0 })
bot.clickWindow(9, 0, 1)
bot.clickWindow(9, 40, 2)
bot.closeWindow(bot.currentWindow || bot.inventory)
declare const villager: Villager
villager.trade(0, 1)
villager.on('tradesUpdated', trades => { trades[0].inputs[0].count.toFixed() })
villager.villagerLevel?.toFixed()
villager.selectedTrade?.realPrice?.toFixed()
