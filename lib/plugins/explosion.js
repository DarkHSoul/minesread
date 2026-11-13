const { attributeValue } = require('../combat_attributes')
const sampleExposure = require('../combat_exposure')

module.exports = function inject (bot) {
  bot.getExplosionDamageEstimate = (target, sourcePos, power, options = {}) => {
    if (!Number.isFinite(power) || power <= 0) throw new RangeError('power must be positive and finite')
    const unknown = reasons => ({ damage: null, healthDamage: null, rawDamage: null, reasons })
    const distance = target.position.distanceTo(sourcePos)
    if (!Number.isFinite(distance)) return unknown(['invalid target position'])
    if (distance > 2 * power) return { damage: 0, healthDamage: 0, rawDamage: 0, reasons: [] }
    const exposure = options.exposure ?? sampleExposure(target, sourcePos, options.rayClear ?? sampleExposure.worldRay(bot.world))
    if (!Number.isFinite(exposure) || exposure < 0 || exposure > 1) return unknown(['exposure required: vanilla collision-shape sampling is not available'])
    const impact = (1 - distance / (2 * power)) * exposure
    const rawDamage = Math.fround((impact * impact + impact) * 7 * power + 1)
    if (options.raw) return { damage: rawDamage, healthDamage: null, rawDamage, reasons: [] }
    const reasons = []
    let armor = options.armor ?? attributeValue(target.attributes, ['minecraft:armor', 'armor', 'generic.armor'])
    let toughness = options.toughness ?? attributeValue(target.attributes, ['minecraft:armor_toughness', 'armor_toughness', 'generic.armor_toughness', 'generic.armorToughness'])
    if (!Number.isFinite(armor) || !Number.isFinite(toughness)) reasons.push('armor and toughness required')
    if (!Number.isFinite(options.protection)) reasons.push('resolved enchantment damage protection required')
    if (!Number.isInteger(options.resistanceAmplifier) || options.resistanceAmplifier < -1) reasons.push('resistanceAmplifier required (-1 for absent)')
    if (options.standardExplosion !== true) reasons.push('standardExplosion assertion required (ordinary damage tags, no weapon armor modifier or custom calculator)')
    if (target.type === 'player' && typeof options.scalesWithDifficulty !== 'boolean') reasons.push('damage source scalesWithDifficulty required')
    let damage = rawDamage
    if (target.type === 'player' && options.scalesWithDifficulty) {
      const difficulty = options.difficulty ?? bot.game?.difficulty
      if (difficulty === 'peaceful') damage = 0
      else if (difficulty === 'easy') damage = Math.min(damage / 2 + 1, damage)
      else if (difficulty === 'hard') damage *= 1.5
      else if (difficulty !== 'normal') reasons.push('difficulty required')
    }
    if (reasons.length) return { ...unknown(reasons), rawDamage }
    armor = Math.max(0, Math.min(30, armor))
    toughness = Math.max(0, Math.min(20, toughness))
    const effectiveArmor = Math.min(20, Math.max(armor * 0.2, armor - damage / (2 + toughness / 4)))
    damage = Math.fround(damage * (1 - effectiveArmor / 25))
    damage = Math.fround(Math.max(0, damage * (25 - (options.resistanceAmplifier + 1) * 5) / 25))
    damage = Math.fround(damage * (1 - Math.max(0, Math.min(20, options.protection)) / 25))
    const healthDamage = Number.isFinite(options.absorption) ? Math.max(0, damage - options.absorption) : null
    return { rawDamage, damage, healthDamage, reasons: [] }
  }
  bot.getExplosionDamages = (target, sourcePos, power, rawDamages = false) => {
    return bot.getExplosionDamageEstimate(target, sourcePos, power, { raw: rawDamages }).damage
  }
}
