/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const { createDeserializer } = require('minecraft-protocol/src/transforms/serializer')
const { teamOptions, patchComponentProtocol } = require('../lib/protocol_compat')

function componentCodec (patched) {
  const protocol = structuredClone(require('minecraft-data')('26.3').protocol)
  if (patched) patchComponentProtocol(protocol)
  else {
    // Reproduce the pinned dependency even when loader bootstrap already patched it.
    const fields = protocol.types.SlotComponent[1][1].type[1].fields
    fields.damage_resistant = fields.provides_banner_patterns = 'string'
    fields.blocks_attacks[1].find(field => field.name === 'bypassedBy').type = ['option', 'string']
    const teleport = protocol.types.ItemConsumeEffect[1][1].type[1].fields.teleport_randomly[1]
    protocol.types.ItemConsumeEffect[1][1].type[1].fields.teleport_randomly[1] = teleport.filter(field => field.name !== 'directionalParticles')
    for (const name of ['sign_text_front', 'sign_text_back']) {
      const filtered = fields[name][1].find(field => field.name === 'filteredMessages')
      if (filtered.type[0] === 'option') filtered.type = filtered.type[1]
    }
  }
  const { ProtoDefCompiler } = require('protodef').Compiler
  const compiler = new ProtoDefCompiler()
  compiler.addTypes(require('minecraft-protocol/src/datatypes/compiler-minecraft'))
  compiler.addProtocol(protocol, ['play', 'toClient'])
  require('prismarine-nbt').addTypesToCompiler('big', compiler)
  return compiler.compileProtoDefSync()
}

function botFor (version) {
  const bot = new EventEmitter()
  bot.registry = require('prismarine-registry')(version)
  bot.supportFeature = bot.registry.supportFeature
  bot._client = new EventEmitter()
  require('../lib/plugins/team')(bot)
  return bot
}

describe('26.3 team protocol compatibility', () => {
  it('consumes actual chorus fruit and empty sign component exports completely', () => {
    const before = componentCodec(false)
    const after = componentCodec(true)
    const chorus = Buffer.from('183fcccccd01bf050101034180000001', 'hex')
    assert.strictEqual(before.read(chorus, 0, 'SlotComponent', {}).size, chorus.length - 1)
    for (const hex of [chorus.toString('hex'), '77080000080000080000080000000f00', '76080000080000080000080000000f00']) {
      const wire = Buffer.from(hex, 'hex')
      const result = after.read(wire, 0, 'SlotComponent', {})
      assert.strictEqual(result.size, wire.length)
      assert.deepStrictEqual(after.createPacketBuffer('SlotComponent', result.value), wire)
    }
    assert.throws(() => before.read(Buffer.from('76080000080000080000080000000f00', 'hex'), 0, 'SlotComponent', {}))
  })

  it('decodes and reencodes official damage-resistant bytes and related holder sets', () => {
    const before = componentCodec(false)
    const after = componentCodec(true)
    // Actual TypedDataComponent.STREAM_CODEC export for ancient_debris.
    const actual = Buffer.from('1b00116d696e6563726166743a69735f66697265', 'hex')
    assert.strictEqual(before.read(actual, 0, 'SlotComponent', {}).size, 2)
    const decoded = after.read(actual, 0, 'SlotComponent', {})
    assert.strictEqual(decoded.size, actual.length)
    assert.deepStrictEqual(decoded.value, { type: 'damage_resistant', data: { name: 'minecraft:is_fire' } })
    // Official default flower-banner-pattern and shield component exports.
    for (const hex of [
      '43001d6d696e6563726166743a7061747465726e5f6974656d2f666c6f776572',
      '253e8000003f8000000142b4000000000000003f800000404000003f8000003f8000000100196d696e6563726166743a62797061737365735f736869656c6401b40b01b50b'
    ]) {
      const wire = Buffer.from(hex, 'hex')
      const result = after.read(wire, 0, 'SlotComponent', {})
      assert.strictEqual(result.size, wire.length)
      assert.deepStrictEqual(after.createPacketBuffer('SlotComponent', result.value), wire)
      assert(before.read(wire, 0, 'SlotComponent', {}).size < wire.length)
    }
    for (const id of [27, 67, 37]) {
      for (const [set, expected] of [[actual.subarray(1), { name: 'minecraft:is_fire' }], [Buffer.from([3, 0, 2]), { ids: [0, 2] }], [Buffer.from([1]), { ids: [] }]]) {
        const wire = id === 37
          ? Buffer.concat([Buffer.from([id]), Buffer.alloc(21), Buffer.from([1]), set, Buffer.from([0, 0])])
          : Buffer.concat([Buffer.from([id]), set])
        const result = after.read(wire, 0, 'SlotComponent', {})
        assert.strictEqual(result.size, wire.length)
        assert.deepStrictEqual(id === 37 ? result.value.data.bypassedBy : result.value.data, expected)
        assert.deepStrictEqual(after.createPacketBuffer('SlotComponent', result.value), wire)
      }
    }
  })

  it('matches the official numeric registry order snapshots', () => {
    const expected = require('./common/protocolRegistry26_3.json')
    const types = require('minecraft-data')('26.3').protocol.types
    assert.deepStrictEqual(Object.values(types.SlotComponentType[1].mappings), expected.components)
    assert.deepStrictEqual(Object.values(types.Particle[1][0].type[1].mappings), expected.particles)
    const metadata = Object.values(types.entityMetadataEntry[1][1].type[1].mappings)
    // This is a schema-local label; the wire ID and codec are unchanged.
    metadata[38] = metadata[38].replace('weathering_copper_golem_state', 'weathering_copper_state')
    assert.deepStrictEqual(metadata, expected.entitySerializers)
  })

  it('preserves both options through the real 777 codec and public team API', () => {
    const parser = createDeserializer({ state: 'play', isServer: false, version: '26.3' })
    // ID, team, add, three NBT strings, visibility, collision, absent color,
    // options=3, one member. Layout independently checked against Mojang codec.
    const wire = Buffer.from('6f0178000800015808000008000000000003010170', 'hex')
    const decoded = parser.parsePacketBuffer(wire).data
    const bot = botFor('26.3')
    bot._client.emit(decoded.name, decoded.params)
    assert.strictEqual(bot.teams.x.friendlyFire, 3)
    assert.strictEqual(bot.teams.x.color, 'reset')
    assert.strictEqual(bot.teamMap.p, bot.teams.x)
    assert.strictEqual(bot.teams.x.name.toString(), 'X')
    for (let mask = 0; mask < 4; mask++) {
      const update = Buffer.from(wire)
      update[update.length - 4] = mask
      const packet = parser.parsePacketBuffer(update).data
      bot._client.emit(packet.name, { ...packet.params, mode: 'change', players: undefined })
      assert.strictEqual(bot.teams.x.friendlyFire, mask)
    }
  })

  it('preserves the legacy numeric mask without changing old schemas', () => {
    for (let mask = 0; mask < 4; mask++) assert.strictEqual(teamOptions({ friendlyFire: mask }), mask)
    assert.strictEqual(teamOptions({}), undefined)
    const protocol = structuredClone(require('minecraft-data')('26.3').protocol)
    patchComponentProtocol(protocol)
    assert.strictEqual(patchComponentProtocol(protocol), false)
    assert.strictEqual(patchComponentProtocol({}), false)
  })
})
