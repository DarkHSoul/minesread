const { Vec3 } = require('vec3')
const { RaycastIterator } = require('prismarine-world').iterators

// rayClear must implement COLLIDER / fluid NONE from sample to source, and
// return null for unavailable world data. It must not treat unloaded air as clear.
module.exports = function exposure (target, source, rayClear) {
  const { width, height, position } = target
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width + height)) return null
  const dx = 1 / (width * 2 + 1)
  const dy = 1 / (height * 2 + 1)
  const offset = (1 - Math.floor(1 / dx) * dx) / 2
  let clear = 0
  let total = 0
  for (let x = 0; x <= 1; x += dx) {
    for (let y = 0; y <= 1; y += dy) {
      for (let z = 0; z <= 1; z += dx) {
        const sample = new Vec3(position.x - width / 2 + x * width + offset, position.y + y * height, position.z - width / 2 + z * width + offset)
        const visible = rayClear(sample, source, target)
        if (typeof visible !== 'boolean') return null
        if (visible) clear++
        total++
      }
    }
  }
  return Math.fround(clear / total)
}

// Conservative automatic subset: known air/fluid and ordinary full cubes only.
// Non-cubic or entity-context-dependent blocks require the explicit callback.
module.exports.worldRay = function worldRay (world) {
  return (sample, source) => {
    if (!world?.getBlock) return null
    const delta = source.minus(sample)
    const range = delta.norm()
    const direction = range === 0 ? new Vec3(0, 0, 0) : delta.scaled(1 / range)
    const iterator = new RaycastIterator(sample, direction, range)
    let position = sample
    while (position) {
      const block = world.getBlock(new Vec3(position.x, position.y, position.z))
      if (!block) return null
      if (!['air', 'cave_air', 'void_air', 'water', 'lava'].includes(block.name)) {
        const fullCube = block.shapes?.length === 1 && block.shapes[0].join(',') === '0,0,0,1,1,1'
        if (!fullCube || /piston|powder_snow|scaffolding/.test(block.name)) return null
        if (iterator.intersect(block.shapes, new Vec3(Math.floor(position.x), Math.floor(position.y), Math.floor(position.z)))) return false
      }
      position = iterator.next()
    }
    return true
  }
}
