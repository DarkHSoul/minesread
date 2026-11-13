/* eslint-env mocha */
const assert = require('assert')
const { Vec3 } = require('vec3')
describe('26.3 conditional explosion damage', () => {
  const bot = { game: { difficulty: 'normal' } }
  require('../lib/plugins/explosion')(bot)
  const target = { type: 'player', position: new Vec3(0, 0, 0), attributes: {} }
  const base = { exposure: 1, armor: 0, toughness: 0, protection: 0, resistanceAmplifier: -1, standardExplosion: true, scalesWithDifficulty: true, absorption: 0 }
  const calc = options => bot.getExplosionDamageEstimate(target, new Vec3(0, 0, 0), 4, { ...base, ...options })
  it('does not invent missing exposure, armor, enchantments or source tags', () => {
    assert.strictEqual(bot.getExplosionDamages(target, target.position, 4, true), null)
    assert.strictEqual(bot.getExplosionDamageEstimate(target, target.position, 4, { exposure: 1 }).damage, null)
  })
  it('calculates raw floats, blocked exposure, radius and player difficulties', () => {
    assert.strictEqual(calc({}).damage, 57)
    assert.strictEqual(calc({ exposure: 0 }).damage, 1)
    assert.strictEqual(calc({ difficulty: 'easy' }).damage, 29.5)
    assert.strictEqual(calc({ difficulty: 'hard' }).damage, 85.5)
    assert.strictEqual(calc({ difficulty: 'peaceful' }).damage, 0)
    assert.strictEqual(bot.getExplosionDamageEstimate(target, new Vec3(9, 0, 0), 4).damage, 0)
    const mob = { ...target, type: 'mob' }
    assert.strictEqual(bot.getExplosionDamageEstimate(mob, target.position, 4, { ...base, difficulty: 'hard' }).damage, 57)
  })
  it('applies armor, toughness, resistance, resolved protection and absorption separately', () => {
    const result = calc({ armor: 20, toughness: 8, resistanceAmplifier: 0, protection: 8, absorption: 4 })
    const armored = Math.fround(57 * (1 - 5.75 / 25))
    const expected = Math.fround(Math.fround(armored * 0.8) * 0.68)
    assert.strictEqual(result.damage, expected)
    assert.strictEqual(result.healthDamage, expected - 4)
  })
})

// Sampler integration is separate from mitigation input availability.
describe('explosion exposure sampling', () => {
  const sample = require('../lib/combat_exposure')
  const target = { position: new Vec3(0.5, 0, 0.5), width: 0.6, height: 1.8 }
  it('samples current dimensions and propagates unknown rays', () => {
    let high = 0
    assert.strictEqual(sample(target, new Vec3(5, 0, 0), p => { high = Math.max(high, p.y); return true }), 1)
    assert(high > 1)
    assert.strictEqual(sample({ ...target, height: 0.5 }, target.position, p => p.y <= 0.5), 1)
    assert.strictEqual(sample(target, target.position, () => null), null)
  })
  it('supports legacy raw damage through loaded air, rejects missing chunks and non-cubes', () => {
    const bot = { world: { getBlock: () => ({ name: 'air', shapes: [] }) } }
    require('../lib/plugins/explosion')(bot)
    assert.strictEqual(bot.getExplosionDamages(target, new Vec3(0.5, 0, 0.5), 4, true), 57)
    bot.world.getBlock = () => null
    assert.strictEqual(bot.getExplosionDamages(target, target.position, 4, true), null)
    bot.world.getBlock = () => ({ name: 'oak_slab', shapes: [[0, 0, 0, 1, 0.5, 1]] })
    assert.strictEqual(bot.getExplosionDamages(target, target.position, 4, true), null)
  })
})
