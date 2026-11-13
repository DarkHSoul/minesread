// Preserve the public numeric team options mask across protocol schemas.
function teamOptions (packet) {
  if (packet.friendlyFire !== undefined) return packet.friendlyFire
  if (packet.flags === undefined) return undefined
  return (packet.flags.friendly_fire ? 1 : 0) | (packet.flags.see_friendly_invisible ? 2 : 0)
}

// Only call for 26.3, before minecraft-protocol compiles its codecs.
function patchComponentProtocol (protocol) {
  const fields = protocol?.types?.SlotComponent?.[1]?.find(field => field.name === 'data')?.type?.[1]?.fields
  if (!fields) return false
  let changed = false
  if (fields.damage_resistant === 'string') {
    fields.damage_resistant = 'IDSet'
    changed = true
  }
  if (fields.provides_banner_patterns === 'string') {
    fields.provides_banner_patterns = 'IDSet'
    changed = true
  }
  const bypassedBy = fields.blocks_attacks?.[1]?.find(field => field.name === 'bypassedBy')
  if (bypassedBy?.type?.[0] === 'option' && bypassedBy.type[1] === 'string') {
    bypassedBy.type = ['option', 'IDSet']
    changed = true
  }
  const teleport = protocol.types.ItemConsumeEffect?.[1]?.find(field => field.anon)?.type?.[1]?.fields?.teleport_randomly
  if (teleport?.[0] === 'container' && !teleport[1].some(field => field.name === 'directionalParticles')) {
    teleport[1].push({ name: 'directionalParticles', type: 'bool' })
    changed = true
  }
  for (const name of ['sign_text_front', 'sign_text_back']) {
    const filtered = fields[name]?.[1]?.find(field => field.name === 'filteredMessages')
    if (filtered?.type?.[0] === 'array') {
      filtered.type = ['option', filtered.type]
      changed = true
    }
  }
  return changed
}

module.exports = { teamOptions, patchComponentProtocol }
