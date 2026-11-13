const { Vec3 } = require('vec3')
const { RaycastIterator } = require('prismarine-world').iterators

module.exports = (bot) => {
  function getViewDirection (pitch, yaw) {
    const csPitch = Math.cos(pitch)
    const snPitch = Math.sin(pitch)
    const csYaw = Math.cos(yaw)
    const snYaw = Math.sin(yaw)
    return new Vec3(-snYaw * csPitch, snPitch, -csYaw * csPitch)
  }

  bot.blockInSight = (maxSteps = 256, vectorLength = 5 / 16) => {
    const block = bot.blockAtCursor(maxSteps * vectorLength)
    if (block) return block
  }

  bot.blockAtCursor = (maxDistance = 256, matcher = null) => {
    return bot.blockAtEntityCursor(bot.entity, maxDistance, matcher)
  }

  function eyePosition (entity) {
    if (!entity?.position || !Number.isFinite(entity.pitch) || !Number.isFinite(entity.yaw)) return null
    const height = entity.eyeHeight ?? entity.height
    if (!Number.isFinite(height)) return null
    return entity.position.offset(0, height, 0)
  }

  function targetAtCursor (targets, maxDistance) {
    const origin = eyePosition(bot.entity)
    if (!origin) return null
    const block = bot.blockAtCursor(maxDistance)
    const blockDistance = block?.intersect.distanceTo(origin) ?? Infinity

    const dir = getViewDirection(bot.entity.pitch, bot.entity.yaw)
    const iterator = new RaycastIterator(origin, dir, maxDistance)
    let targetEntity = null
    let targetDist = Infinity

    for (const entity of targets) {
      if (entity === bot.entity || entity.id === bot.entity.id || entity.type === 'object') continue
      if (!entity.position || !Number.isFinite(entity.width) || !Number.isFinite(entity.height)) continue
      const w = entity.width / 2
      const shapes = [[-w, 0, -w, w, entity.height, w]]
      const relative = origin.minus(entity.position)
      const inside = Math.abs(relative.x) <= w && Math.abs(relative.z) <= w && relative.y >= 0 && relative.y <= entity.height
      const intersect = iterator.intersect(shapes, entity.position)
      if (!inside && (!intersect || intersect.pos.minus(origin).dot(dir) < 0)) continue
      const dist = inside ? 0 : origin.distanceTo(intersect.pos)
      if (dist <= maxDistance && dist < blockDistance && dist < targetDist) {
        targetEntity = entity
        targetDist = dist
      }
    }

    return targetEntity
  }

  bot.entityAtCursor = (maxDistance = 3.5) => targetAtCursor(Object.values(bot.entities), maxDistance)

  // Separate from entityAtCursor: reconstructed dragon geometry is explicitly
  // approximate, and callers must retain the returned part's confidence flag.
  bot.entityPartAtCursor = (maxDistance = 3.5) => {
    const parts = Object.values(bot.entities).flatMap(entity => bot.getEntityParts?.(entity) ?? [])
    return targetAtCursor(parts.filter(part => part.initialized), maxDistance)
  }

  bot.blockAtEntityCursor = (entity = bot.entity, maxDistance = 256, matcher = null) => {
    const origin = eyePosition(entity)
    if (!origin) return null
    const viewDirection = getViewDirection(entity.pitch, entity.yaw)

    return bot.world.raycast(origin, viewDirection, maxDistance, matcher)
  }
}
