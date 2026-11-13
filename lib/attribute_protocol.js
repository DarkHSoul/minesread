// Mojang 26.3 attribute IDs are registry ordinals, not the legacy attribute mapper.
// Keep the wire ID until the entity handler can use the current registry.
const legacyIds = new Map()

function attributeKey (protocol) {
  const packet = protocol.play.toClient.types.packet_entity_update_attributes
  const properties = packet[1].find(field => field.name === 'properties')
  return properties.type[1].type[1].find(field => field.name === 'key')
}

function rememberMapper (key) {
  if (Array.isArray(key.type) && key.type[0] === 'mapper') {
    for (const [id, alias] of Object.entries(key.type[1].mappings)) legacyIds.set(alias, Number(id))
  }
}

function patchAttributeProtocol (protocol) {
  const key = attributeKey(protocol)
  rememberMapper(key)
  key.type = 'varint'
}

function normalizeAttributeKey (key, registry) {
  if (registry.version.minecraftVersion !== '26.3') return key
  // Also support clients whose decoder was compiled before the bootstrap patch.
  rememberMapper(attributeKey(require('minecraft-data')('26.3').protocol))
  const id = typeof key === 'number' ? key : legacyIds.get(key)
  return registry.attributesArray[id]?.resource ?? key
}

module.exports = { patchAttributeProtocol, normalizeAttributeKey }
