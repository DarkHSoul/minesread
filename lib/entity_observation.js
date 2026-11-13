const PHASES = Object.freeze(['HoldingPattern', 'StrafePlayer', 'LandingApproach', 'Landing', 'Takeoff', 'SittingFlaming', 'SittingScanning', 'SittingAttacking', 'ChargingPlayer', 'Dying', 'Hover'])

function namedMetadata (entity, registry) {
  const keys = registry.entitiesByName?.[entity.name]?.metadataKeys
  const named = {}
  if (keys) {
    for (const [index, value] of Object.entries(entity.metadata || {})) {
      if (keys[index] !== undefined) named[keys[index]] = value
    }
  }
  return named
}

function dragonPhase (metadata) {
  if (!Number.isInteger(metadata.phase)) return undefined
  return { id: metadata.phase, name: PHASES[metadata.phase] }
}

function entityState (entity, metadata, supported) {
  // Named raw metadata works on any registry; these semantic masks are verified for 26.3.
  if (!supported) return { metadata }
  const flag = bit => typeof metadata.shared_flags === 'number' ? (metadata.shared_flags & (1 << bit)) !== 0 : undefined
  const state = {
    metadata,
    sharedFlags: metadata.shared_flags,
    health: metadata.health,
    pose: metadata.pose,
    onFire: flag(0),
    shiftKeyDown: flag(1),
    crouching: typeof metadata.pose === 'number' ? metadata.pose === 5 : undefined,
    sprinting: flag(3),
    swimming: flag(4),
    invisible: flag(5),
    glowing: flag(6),
    fallFlying: flag(7),
    ticksFrozen: metadata.ticks_frozen,
    frozen: typeof metadata.ticks_frozen === 'number' ? metadata.ticks_frozen > 0 : undefined,
    fullyFrozen: typeof metadata.ticks_frozen === 'number' ? metadata.ticks_frozen >= 140 : undefined
  }
  if (entity.name === 'creeper') state.creeper = { swellDirection: metadata.swell_dir, powered: metadata.is_powered, ignited: metadata.is_ignited }
  if (entity.name === 'blaze') state.blaze = { charged: typeof metadata.flags === 'number' ? (metadata.flags & 1) !== 0 : undefined }
  if (entity.name === 'enderman') state.enderman = { creepy: metadata.creepy, staredAt: metadata.stared_at }
  if (entity.name === 'ender_dragon') state.dragonPhase = dragonPhase(metadata)
  return state
}

module.exports = { namedMetadata, entityState, dragonPhase, PHASES }
