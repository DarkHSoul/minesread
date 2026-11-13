// Prints what the installed stack knows about the target Minecraft versions.
// Usage: node scripts/check-versions.js [version ...]   (default: 26.1 26.2 26.3)
const path = require('path')
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['26.1', '26.2', '26.3']

const mcData = require('minecraft-data')
const mineflayer = require('../..')
const mcProto = require('minecraft-protocol')
const read = (p) => require(path.join(p, 'package.json'))

console.log('mineflayer          ', require('../../package.json').version + ' (this fork)')
console.log('minecraft-protocol  ', read(path.dirname(require.resolve('minecraft-protocol/package.json'))).version)
console.log('minecraft-data      ', read(path.dirname(require.resolve('minecraft-data/package.json'))).version)
try { console.log('data patch          ', require('minecraft-data/minesread-data.json').sha.slice(0, 10)) } catch { console.log('data patch           none (run: npm run minesread:setup-data)') }
console.log('mineflayer supports ', mineflayer.supportedVersions || mineflayer.testedVersions)
console.log('protocol supports   ', mcProto.supportedVersions && mcProto.supportedVersions.slice(-6))
console.log()

let failed = 0
for (const v of targets) {
  const d = mcData(v)
  if (!d) { console.log(`${v}: NO DATA`); failed++; continue }
  const nBlocks = Object.keys(d.blocksByName).length
  const nItems = Object.keys(d.itemsByName).length
  const nEnt = Object.keys(d.entitiesByName).length
  const ok = nBlocks > 900 && nItems > 1000 && d.protocol && d.version
  console.log(`${v}: protocol ${d.version.version} blocks=${nBlocks} items=${nItems} entities=${nEnt} recipes=${Object.keys(d.recipes || {}).length} ${ok ? 'OK' : 'SUSPICIOUS'}`)
  if (!ok) failed++
}
process.exit(failed ? 1 : 0)
