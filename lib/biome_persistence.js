// Compatibility shim for the pinned prismarine-chunk fork. Its direct palette
// constructor ignores options.data, and palette JSON omits noSizePrefix.
// Patch only biome serialization; block palette behavior is not changed.
const BiomeSection = require('prismarine-chunk/src/pc/common/PaletteBiome')
const { DirectPaletteContainer } = require('prismarine-chunk/src/pc/common/PaletteContainer')
const BitArray = require('prismarine-chunk/src/pc/common/BitArrayNoSpan')

const toJson = BiomeSection.prototype.toJson
const fromJson = BiomeSection.fromJson

BiomeSection.prototype.toJson = function () {
  return JSON.stringify({ ...JSON.parse(toJson.call(this)), noSizePrefix: this.data.noSizePrefix })
}

BiomeSection.fromJson = function (json) {
  const parsed = JSON.parse(json)
  if (parsed.type !== 'direct') return fromJson.call(this, json)
  const data = BitArray.fromJson(parsed.data)
  const container = new DirectPaletteContainer({
    bitsPerValue: data.bitsPerValue,
    capacity: data.capacity,
    noSizePrefix: parsed.noSizePrefix
  })
  container.data = data
  return new BiomeSection({ data: container, noSizePrefix: parsed.noSizePrefix })
}
