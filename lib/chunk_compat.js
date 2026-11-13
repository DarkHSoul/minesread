const { SmartBuffer } = require('smart-buffer')
const BiomeSection = require('prismarine-chunk/src/pc/common/PaletteBiome')
const { SingleValueContainer, IndirectPaletteContainer, DirectPaletteContainer } = require('prismarine-chunk/src/pc/common/PaletteContainer')
const varInt = require('prismarine-chunk/src/pc/common/varInt')
require('./biome_persistence')

// Decode at the packet's width, not a constructor's possibly stale registry width.
function readPalette (reader, capacity, minBits, maxBits, globalBits, noSizePrefix) {
  const wireBits = reader.readUInt8()
  if (wireBits > 31) throw new Error('Invalid palette width')
  if (wireBits === 0) {
    const value = varInt.read(reader)
    if (value < 0) throw new Error('Invalid palette entry')
    if (!noSizePrefix && varInt.read(reader) !== 0) throw new Error('Invalid single palette length')
    return new SingleValueContainer({ value, capacity, bitsPerValue: minBits, maxBits, maxBitsPerBlock: globalBits, noSizePrefix })
  }
  const bits = wireBits <= maxBits ? Math.max(minBits, wireBits) : wireBits
  let container
  if (wireBits <= maxBits) {
    const length = varInt.read(reader)
    if (length < 1 || length > 2 ** bits) throw new Error('Invalid palette length')
    const palette = []
    for (let i = 0; i < length; i++) {
      const id = varInt.read(reader)
      if (id < 0) throw new Error('Invalid palette entry')
      palette.push(id)
    }
    globalBits = Math.max(globalBits, ...palette.map(id => Math.max(1, Math.ceil(Math.log2(id + 1)))))
    container = new IndirectPaletteContainer({ palette, capacity, bitsPerValue: bits, maxBits, maxBitsPerBlock: globalBits, noSizePrefix })
  } else {
    container = new DirectPaletteContainer({ capacity, bitsPerValue: bits, noSizePrefix })
  }
  const longs = Math.ceil(capacity / Math.floor(64 / bits))
  if (!noSizePrefix && varInt.read(reader) !== longs) throw new Error('Invalid palette data length')
  // BitArray.readBuffer does not itself reject a short SmartBuffer payload.
  if (reader.remaining() < longs * 8) throw new Error('Truncated palette data')
  container.data.readBuffer(reader, longs * 2)
  for (let i = 0; i < capacity; i++) {
    if (!Number.isInteger(container.get(i))) throw new Error(capacity === 64 ? 'Invalid biome palette entry' : 'Invalid block palette entry')
  }
  return container
}

function applyChunkCompat (Chunk, registry) {
  if (!registry.version['>=']('1.18') || Object.hasOwn(Chunk, '_minesreadCompat')) return Chunk
  Object.defineProperty(Chunk, '_minesreadCompat', { value: true })
  const noSizePrefix = registry.version['>=']('1.21.5')
  const hasFluidCount = registry.version['>=']('26.1')
  const ChunkSection = Chunk.section
  Chunk.prototype.load = function (data) {
    const reader = SmartBuffer.fromBuffer(Buffer.from(data))
    const sections = []
    const biomes = []
    for (let i = 0; i < this.numSections; i++) {
      const solidBlockCount = reader.readInt16BE()
      const fluidCount = hasFluidCount ? reader.readInt16BE() : 0
      if (solidBlockCount < 0 || solidBlockCount > 4096 || fluidCount < 0 || fluidCount > 4096) throw new Error('Invalid section counts')
      sections.push(new ChunkSection({
        solidBlockCount,
        fluidCount,
        hasFluidCount,
        noSizePrefix,
        data: readPalette(reader, 4096, 4, 8, this.maxBitsPerBlock, noSizePrefix)
      }))
      biomes.push(new BiomeSection({ noSizePrefix, data: readPalette(reader, 64, 1, 3, this.maxBitsPerBiome, noSizePrefix) }))
    }
    if (reader.remaining() !== 0) throw new Error('Unexpected trailing chunk data')
    this.sections = sections
    this.biomes = biomes
  }
  const fromJson = Chunk.fromJson
  Chunk.fromJson = function (json) {
    const column = fromJson.call(this, json)
    const parsed = JSON.parse(json)
    // The pinned fork interchanges these two masks during JSON restoration.
    const mask = column.emptySkyLightMask.constructor
    column.emptySkyLightMask = mask.fromLongArray(parsed.emptySkyLightMask, 1)
    column.emptyBlockLightMask = mask.fromLongArray(parsed.emptyBlockLightMask, 1)
    for (const section of [...column.sections, ...column.biomes]) {
      section.noSizePrefix = noSizePrefix
      section.data.noSizePrefix = noSizePrefix
    }
    return column
  }
  return Chunk
}
module.exports = applyChunkCompat
module.exports.readPalette = readPalette
