/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')
const injectRayTrace = require('../lib/plugins/ray_trace')
const injectEntities = require('../lib/plugins/entities')

function visionBot () {
  const bot = {
    entity: { id: 1, position: new Vec3(0, 0, 0), height: 1.8, eyeHeight: 1.62, yaw: 0, pitch: 0 },
    entities: {},
    world: { raycast: () => null }
  }
  injectRayTrace(bot)
  return bot
}

function target (id, z, width = 0.6) {
  return { id, type: 'mob', position: new Vec3(0, 0, z), width, height: 1.8 }
}

describe('vision observation regressions', () => {
  it('accepts zero pitch/yaw and casts from eye height, including crouching', () => {
    const bot = visionBot()
    let observed
    bot.world.raycast = (...args) => { observed = args; return 'hit' }
    assert.strictEqual(bot.blockAtCursor(5), 'hit')
    assert.deepStrictEqual(observed[0], new Vec3(0, 1.62, 0))
    assert.strictEqual(observed[1].distanceTo(new Vec3(0, 0, -1)), 0)
    bot.entity.eyeHeight = 1.27
    bot.blockAtCursor()
    assert.deepStrictEqual(observed[0], new Vec3(0, 1.27, 0))
  })

  it('falls back to height only without eyeHeight and rejects unknown angles', () => {
    const bot = visionBot()
    let origin
    bot.world.raycast = pos => { origin = pos; return 'hit' }
    delete bot.entity.eyeHeight
    assert.strictEqual(bot.blockAtCursor(), 'hit')
    assert.strictEqual(origin.y, 1.8)
    bot.entity.pitch = undefined
    assert.strictEqual(bot.blockAtCursor(), null)
    assert.strictEqual(bot.entityAtCursor(), null)
    bot.entity.pitch = NaN
    assert.strictEqual(bot.blockAtCursor(), null)
  })

  it('uses hitbox distance instead of entity-center distance for reach', () => {
    const bot = visionBot()
    const mob = target(2, -4, 2)
    bot.entities = { 2: mob }
    assert.strictEqual(bot.entityAtCursor(3.5), mob)
    assert.strictEqual(bot.entityAtCursor(2.9), null)
  })

  it('does not select entities hidden by a wall, behind the eye, or self', () => {
    const bot = visionBot()
    bot.entities = { 1: bot.entity, 2: target(2, -3.4), 3: target(3, 2) }
    bot.world.raycast = () => ({ intersect: new Vec3(0, 1.62, -3) })
    assert.strictEqual(bot.entityAtCursor(5), null)
    bot.world.raycast = () => null
    assert.strictEqual(bot.entityAtCursor(5), bot.entities[2])
  })

  it('chooses the nearest intersecting hitbox', () => {
    const bot = visionBot()
    bot.entities = { 2: target(2, -3), 3: target(3, -2) }
    assert.strictEqual(bot.entityAtCursor(5), bot.entities[3])
  })

  it('includes the reach boundary but excludes a hit at the wall boundary', () => {
    const bot = visionBot()
    const mob = target(2, -4, 2)
    bot.entities = { 2: mob }
    assert.strictEqual(bot.entityAtCursor(3), mob)
    bot.world.raycast = () => ({ intersect: new Vec3(0, 1.62, -3) })
    assert.strictEqual(bot.entityAtCursor(3), null)
  })

  it('selects an enclosing hitbox at zero distance', () => {
    const bot = visionBot()
    const mob = target(2, 0, 2)
    bot.entities = { 2: mob }
    assert.strictEqual(bot.entityAtCursor(0), mob)
  })
})

describe('damage observation regressions', () => {
  let bot
  const protocol = require('minecraft-protocol')
  const serializer = protocol.createSerializer({ state: 'play', isServer: true, version: '26.3' })
  const parser = protocol.createDeserializer({ state: 'play', isServer: false, version: '26.3' })
  function receiveDamage (hex) {
    const buffer = Buffer.from(hex, 'hex')
    const packet = parser.parsePacketBuffer(buffer).data
    assert.strictEqual(packet.name, 'damage_event')
    assert.deepStrictEqual(serializer.createPacketBuffer(packet), buffer)
    let damage
    bot.once('entityDamage', value => { damage = value })
    bot._client.emit(packet.name, packet.params)
    return damage
  }
  beforeEach(() => {
    bot = new EventEmitter()
    bot.version = '26.3'
    bot.registry = require('prismarine-registry')(bot.version)
    bot._client = new EventEmitter()
    bot.supportFeature = bot.registry.supportFeature
    injectEntities(bot)
  })

  it('preserves projectile details and the legacy entityHurt arguments', () => {
    const victim = { id: 10 }
    const attacker = { id: 0 }
    const arrow = { id: 20 }
    bot.entities = { 10: victim, 0: attacker, 20: arrow }
    bot._client.emit('registry_data', { id: 'minecraft:damage_type', entries: [{ key: 'example:custom_arrow' }] })
    let damage
    let hurt
    bot.on('entityDamage', value => { damage = value })
    bot.on('entityHurt', (...args) => { hurt = args })
    bot._client.emit('damage_event', {
      entityId: 10,
      sourceTypeId: 0,
      sourceCauseId: 1,
      sourceDirectId: 21,
      sourcePosition: { x: 4, y: 5, z: 6 }
    })
    assert.deepStrictEqual(hurt, [victim, attacker])
    assert.deepStrictEqual(damage, {
      entityId: 10,
      entity: victim,
      sourceTypeId: 0,
      sourceType: 'example:custom_arrow',
      sourceCauseId: 0,
      sourceDirectId: 20,
      sourceCause: attacker,
      sourceDirect: arrow,
      sourcePosition: new Vec3(4, 5, 6)
    })
  })

  it('retains IDs for unloaded entities and marks absent environmental sources', () => {
    let damage
    bot.on('entityDamage', value => { damage = value })
    bot._client.emit('damage_event', { entityId: 10, sourceTypeId: 8, sourceCauseId: 0, sourceDirectId: 51 })
    assert.strictEqual(damage.entity, undefined)
    assert.strictEqual(damage.sourceType, undefined)
    assert.strictEqual(damage.sourceTypeId, 8)
    assert.strictEqual(damage.sourceCauseId, null)
    assert.strictEqual(damage.sourceDirectId, 50)
    assert.strictEqual(damage.sourceDirect, undefined)
    assert.strictEqual(damage.sourcePosition, null)
  })

  it('replaces registry IDs during reconfiguration without stale names', () => {
    let damage
    bot.on('entityDamage', value => { damage = value })
    const packet = { entityId: 1, sourceTypeId: 0, sourceCauseId: 0, sourceDirectId: 0 }
    bot._client.emit('registry_data', { id: 'minecraft:damage_type', entries: [{ key: 'minecraft:lava' }] })
    bot._client.emit('start_configuration')
    bot._client.emit('damage_event', packet)
    assert.strictEqual(damage.sourceType, undefined)
    bot._client.emit('registry_data', { id: 'minecraft:damage_type', entries: [{ key: 'minecraft:fall' }] })
    bot._client.emit('damage_event', packet)
    assert.strictEqual(damage.sourceType, 'minecraft:fall')
  })

  // 26.3 ClientboundDamageEventPacket: registry holder ID has no offset;
  // optional entity IDs encode absent as 0 and present as entity ID + 1.
  it('roundtrips an environmental damage wire fixture with registry ID zero', () => {
    bot._client.emit('registry_data', { id: 'minecraft:damage_type', entries: [{ key: 'minecraft:lava' }] })
    const damage = receiveDamage('190a00000000')
    assert.strictEqual(damage.entityId, 10)
    assert.strictEqual(damage.sourceTypeId, 0)
    assert.strictEqual(damage.sourceType, 'minecraft:lava')
    assert.strictEqual(damage.sourceCauseId, null)
    assert.strictEqual(damage.sourceDirectId, null)
    assert.strictEqual(damage.sourcePosition, null)
    assert.strictEqual(Object.hasOwn(damage, 'amount'), false)
  })

  it('roundtrips distinct projectile source IDs including entity zero and position', () => {
    const attacker = { id: 0 }
    const arrow = { id: 20 }
    bot.entities = { 0: attacker, 20: arrow }
    const damage = receiveDamage('190a08011501401000000000000040140000000000004018000000000000')
    assert.strictEqual(damage.sourceTypeId, 8)
    assert.strictEqual(damage.sourceCauseId, 0)
    assert.strictEqual(damage.sourceDirectId, 20)
    assert.strictEqual(damage.sourceCause, attacker)
    assert.strictEqual(damage.sourceDirect, arrow)
    assert.deepStrictEqual(damage.sourcePosition, new Vec3(4, 5, 6))
  })

  it('roundtrips IDs without requiring their entities to be loaded', () => {
    const damage = receiveDamage('190a08013300')
    assert.strictEqual(damage.entity, undefined)
    assert.strictEqual(damage.sourceCauseId, 0)
    assert.strictEqual(damage.sourceDirectId, 50)
    assert.strictEqual(damage.sourceCause, undefined)
    assert.strictEqual(damage.sourceDirect, undefined)
  })
})
