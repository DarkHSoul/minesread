const { SmartBuffer } = require('smart-buffer')
require('./biome_persistence')
// loadBiomes is a no-op for 1.18+ in the pinned chunk fork.
const BiomeSection = require('prismarine-chunk/src/pc/common/PaletteBiome')
const { DirectPaletteContainer } = require('prismarine-chunk/src/pc/common/PaletteContainer')

module.exports = function loadChunkBiomes (column, data, registry) {
  const reader = SmartBuffer.fromBuffer(Buffer.from(data))
  const sections = []
  const noSizePrefix = registry.version['>=']('1.21.5')
  for (let i = 0; i < column.numSections; i++) {
    const bits = reader.internalBuffer.readUInt8(reader.readOffset)
    let section
    if (bits > 3) {
      // The direct width belongs to this packet's registry. The column may
      // have been allocated before configuration supplied custom biomes.
      if (bits > 31) throw new Error('Invalid direct biome palette width')
      reader.readUInt8()
      section = new BiomeSection({
        data: new DirectPaletteContainer({ bitsPerValue: bits, capacity: 64, noSizePrefix }).readBuffer(reader, bits)
      })
    } else {
      section = BiomeSection.read(reader, column.maxBitsPerBiome, noSizePrefix)
    }
    for (let y = 0; y < 4; y++) {
      for (let z = 0; z < 4; z++) {
        for (let x = 0; x < 4; x++) {
          const id = section.get({ x, y, z })
          if (!Number.isInteger(id) || id < 0) throw new Error('Invalid biome palette entry')
        }
      }
    }
    sections.push(section)
  }
  if (reader.remaining() !== 0) throw new Error('Unexpected trailing chunk biome data')
  // Publish only after every section has decoded, preserving blocks and light.
  column.biomes = sections
}
