const { Vec3 } = require('vec3')
const { toNotchianYaw } = require('./conversions')
const PARTS = Object.freeze([
  ['head', 1, 1], ['neck', 3, 3], ['body', 5, 3],
  ['tail', 2, 2], ['tail', 2, 2], ['tail', 2, 2], ['wing', 4, 2], ['wing', 4, 2]
])

class DragonFlightHistory {
  constructor () { this.samples = new Array(64); this.head = -1; this.count = 0 }
  record (y, yaw) {
    const sample = { y, yaw }
    if (this.head < 0) this.samples.fill(sample)
    this.head = (this.head + 1) & 63
    this.samples[this.head] = sample
    this.count++
  }

  get (offset) { return this.samples[(this.head - offset) & 63] }
}

function createParts (parent) {
  return PARTS.map(([name, width, height], index) => ({
    id: parent.id + index + 1,
    name,
    partIndex: index,
    parent,
    type: 'mob',
    width,
    height,
    position: null,
    initialized: false,
    confidence: 'uninitialized',
    historyComplete: false
  }))
}

function wrap (a) { return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI }

// Vanilla transforms, driven by observed parent samples rather than vanilla's unexposed
// per-client interpolation and yRotA. Consequently all reconstructed positions are approximate.
function updateParts (parts, history, phase, record = false) {
  const parent = parts[0].parent
  if (!parent.position || ![parent.position.x, parent.position.y, parent.position.z, parent.yaw].every(Number.isFinite)) {
    for (const part of parts) { part.initialized = false; part.position = null; part.confidence = 'uninitialized' }
    return false
  }
  const yaw = toNotchianYaw(parent.yaw) * Math.PI / 180
  if (record || history.head < 0) history.record(parent.position.y, yaw)
  const base = history.get(5)
  const tilt = (base.y - history.get(10).y) * 10 * Math.PI / 180
  const c = Math.cos(tilt); const s = Math.sin(tilt)
  const sy = Math.sin(yaw); const cy = Math.cos(yaw)
  const sitting = phase && [5, 6, 7].includes(phase.id)
  const headY = sitting ? -1 : base.y - history.get(0).y
  const offsets = [
    [sy * 6.5 * c, headY + s * 6.5, -cy * 6.5 * c],
    [sy * 5.5 * c, headY + s * 5.5, -cy * 5.5 * c],
    [sy * 0.5, 0, -cy * 0.5]
  ]
  for (let i = 0; i < 3; i++) {
    const sample = history.get(12 + i * 2)
    const angle = yaw + wrap(sample.yaw - base.yaw)
    const length = (i + 1) * 2
    offsets.push([-(sy * 1.5 + Math.sin(angle) * length) * c, sample.y - base.y - (length + 1.5) * s + 1.5, (cy * 1.5 + Math.cos(angle) * length) * c])
  }
  offsets.push([cy * 4.5, 2, sy * 4.5], [-cy * 4.5, 2, -sy * 4.5])
  parts.forEach((part, i) => {
    part.position = new Vec3(parent.position.x + offsets[i][0], parent.position.y + offsets[i][1], parent.position.z + offsets[i][2])
    part.initialized = true
    part.confidence = 'approximate'
    part.historyComplete = history.count >= 17
    part.approximation = 'Observed parent ticks; vanilla interpolation and yRotA unavailable'
  })
  return true
}

module.exports = { PARTS, DragonFlightHistory, createParts, updateParts }
