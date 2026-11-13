// Durable fixes for the pinned palette JSON codec: preserve direct storage and
// the modern no-length-prefix flag for both block and biome containers.
const BiomeSection = require('prismarine-chunk/src/pc/common/PaletteBiome')
const palettes = require('prismarine-chunk/src/pc/common/PaletteContainer')
const BitArray = require('prismarine-chunk/src/pc/common/BitArrayNoSpan')

for (const Container of [palettes.SingleValueContainer, palettes.IndirectPaletteContainer, palettes.DirectPaletteContainer]) {
  const toJson = Container.prototype.toJson
  Container.prototype.toJson = function () {
    return JSON.stringify({ ...JSON.parse(toJson.call(this)), noSizePrefix: this.noSizePrefix })
  }
}
const fromJson = palettes.fromJson
palettes.fromJson = function (json) {
  const parsed = JSON.parse(json)
  if (parsed.type !== 'direct') return fromJson(json)
  const data = BitArray.fromJson(parsed.data)
  const container = new palettes.DirectPaletteContainer({ bitsPerValue: data.bitsPerValue, capacity: data.capacity, noSizePrefix: parsed.noSizePrefix })
  container.data = data
  return container
}
palettes.DirectPaletteContainer.fromJson = palettes.fromJson
BiomeSection.fromJson = function (json) {
  const data = palettes.fromJson(json)
  return new BiomeSection({ data, noSizePrefix: data.noSizePrefix })
}
