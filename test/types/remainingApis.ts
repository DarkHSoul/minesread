import { Bot, EntityPart, ServerRecipeEntry, AdvancementState } from '../..'
declare const bot: Bot
const state = bot.getEntityState(bot.entity)
state?.creeper?.swellDirection?.toFixed()
bot.getEntityMetadata(bot.entity.id)
bot.getDragonPhase(bot.entity)?.name?.toLowerCase()
const part: EntityPart | null = bot.entityPartAtCursor(4)
if (part?.initialized && part.position) {
  part.position.distanceTo(bot.entity.position)
  bot.attack(part, false)
}
bot.getAttackStrengthScale(0)?.toFixed()
bot.getAttackCooldownTicks()?.toFixed()
bot.getItemSwapScale()?.toFixed()
const estimate = bot.getExplosionDamageEstimate(bot.entity, bot.entity.position, 6, {
  exposure: 1,
  standardExplosion: true,
  armor: 0,
  toughness: 0,
  protection: 0,
  resistanceAmplifier: -1,
  scalesWithDifficulty: true
})
estimate.damage?.toFixed()
estimate.reasons.join(', ')
const recipe: ServerRecipeEntry | null = bot.getServerRecipe(1)
recipe?.recipe.display.type.toLowerCase()
bot.serverRecipes.highlighted.has(1)
const advancement: AdvancementState | null = bot.getAdvancement('minecraft:end/kill_dragon')
advancement?.progress?.map(p => p.criterionIdentifier)
bot.isAdvancementDone('minecraft:end/kill_dragon')
bot.on('entityStateUpdate', (entity, next, previous) => { void entity; void next.health; void previous?.health })
bot.on('entityPartsUpdate', (entity, parts) => { void entity; parts.map(p => p.confidence) })
bot.on('serverRecipeAdded', entry => { entry.recipe.displayId.toFixed() })
bot.on('advancementCompleted', entry => { entry.id.toLowerCase() })
