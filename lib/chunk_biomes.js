const { SmartBuffer } = require('smart-buffer')
const BiomeSection = require('prismarine-chunk/src/pc/common/PaletteBiome')
const { readPalette } = require('./chunk_compat')

module.exports = function loadChunkBiomes (column, data, registry) {
  const reader = SmartBuffer.fromBuffer(Buffer.from(data))
  const sections = []
  const noSizePrefix = registry.version['>=']('1.21.5')
  for (let i = 0; i < column.numSections; i++) {
    sections.push(new BiomeSection({ noSizePrefix, data: readPalette(reader, 64, 1, 3, column.maxBitsPerBiome, noSizePrefix) }))
  }
  if (reader.remaining() !== 0) throw new Error('Unexpected trailing chunk biome data')
  column.biomes = sections
}
