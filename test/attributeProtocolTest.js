/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')
const { createDeserializer } = require('minecraft-protocol/src/transforms/serializer')
const { patchAttributeProtocol } = require('../lib/attribute_protocol')

function botFor (version) {
  const bot = new EventEmitter()
  bot._client = new EventEmitter()
  bot.version = version
  bot.registry = require('prismarine-registry')(version)
  bot.supportFeature = bot.registry.supportFeature
  require('../lib/plugins/entities')(bot)
  require('../lib/plugins/combat')(bot)
  require('../lib/plugins/explosion')(bot)
  return bot
}

describe('attribute wire registry IDs', () => {
  it('decodes the real speed fixture through the entity handler', () => {
    patchAttributeProtocol(require('minecraft-data')('26.3').protocol)
    const parser = createDeserializer({ state: 'play', isServer: false, version: '26.3' })
    const bot = botFor('26.3')
    const packet = parser.parsePacketBuffer(Buffer.from('8601010105401000000000000000', 'hex')).data
    assert.strictEqual(packet.params.properties[0].key, 5)
    bot._client.emit(packet.name, packet.params)
    bot.entity = bot.entities[1]
    assert.strictEqual(bot.getAttackStrengthDelay(), 5)
    // All forty ordinals, including IDs absent from the pinned mapper.
    for (let id = 0; id < bot.registry.attributesArray.length; id++) {
      const wire = Buffer.alloc(14)
      Buffer.from([0x86, 1, 1, 1, id]).copy(wire)
      wire.writeDoubleBE(id, 5)
      const decoded = parser.parsePacketBuffer(wire).data
      bot._client.emit(decoded.name, decoded.params)
      assert.strictEqual(bot.entity.attributes[bot.registry.attributesArray[id].resource].value, id)
    }
    bot.entity.position = new Vec3(0, 0, 0)
    bot.entity.attributes['minecraft:armor'].value = 20
    bot.entity.attributes['minecraft:armor_toughness'].value = 8
    const estimate = bot.getExplosionDamageEstimate(bot.entity, new Vec3(1, 0, 0), 2, {
      exposure: 1, protection: 0, resistanceAmplifier: -1, standardExplosion: true, scalesWithDifficulty: false
    })
    assert.strictEqual(estimate.reasons.length, 0)
    assert(estimate.damage < estimate.rawDamage)
  })
  it('normalizes legacy compiled aliases and uses a replacement session registry', () => {
    // Simulate a decoder compiled from the old mapper before bootstrap.
    const oldProtocol = structuredClone(require('minecraft-data')('26.3').protocol)
    oldProtocol.play.toClient.types.packet_entity_update_attributes[1][1].type[1].type[1][0].type = [
      'mapper', { type: 'varint', mappings: { 5: 'player.block_break_speed' } }
    ]
    patchAttributeProtocol(oldProtocol)
    const bot = botFor('26.3')
    bot._client.emit('entity_update_attributes', { entityId: 1, properties: [{ key: 'player.block_break_speed', value: 4, modifiers: [] }] })
    assert.strictEqual(bot.entities[1].attributes['minecraft:attack_speed'].value, 4)
    bot.registry = { ...bot.registry, attributesArray: [{ resource: 'example:replacement' }] }
    bot._client.emit('entity_update_attributes', { entityId: 1, properties: [{ key: 0, value: 7, modifiers: [] }] })
    assert.strictEqual(bot.entities[1].attributes['example:replacement'].value, 7)
  })
  it('preserves older version attribute names', () => {
    const bot = botFor('1.20.4')
    bot._client.emit('entity_update_attributes', { entityId: 1, properties: [{ key: 'generic.attack_speed', value: 4, modifiers: [] }] })
    assert.strictEqual(bot.entities[1].attributes['generic.attack_speed'].value, 4)
  })
})
