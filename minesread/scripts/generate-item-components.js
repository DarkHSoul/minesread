const fs = require('fs')
const path = require('path')
const base = process.argv[2]
if (!base) throw Error('Usage: node minesread/scripts/generate-item-components.js <artifact-work-directory>')
require('../../lib/protocol_compat').patchComponentProtocol(require('minecraft-data')('26.3').protocol)
const proto = require('minecraft-protocol/src/transforms/serializer').createDeserializer({ state: 'play', version: '26.3', isServer: false }).proto
const components = []; const indices = new Map(); const items = {}; const failures = []
for (const line of fs.readFileSync(path.join(base, 'default-components-wire.tsv'), 'utf8').trim().split(/\r?\n/)) {
  const [id, wire] = line.split('\t'); const values = []; const unknown = []
  for (const encoded of wire.split(',')) {
    if (encoded.startsWith('!')) { unknown.push(encoded.slice(1).replace('minecraft:', '')); continue }
    try {
      const buf = Buffer.from(encoded, 'base64'); const { value, size } = proto.read(buf, 0, 'SlotComponent', {})
      if (size !== buf.length) throw Error(id + ' ' + JSON.stringify(value) + ' ' + size + '/' + buf.length + ' ' + buf.toString('hex'))
      const key = JSON.stringify(value)
      if (!indices.has(key)) { indices.set(key, components.length); components.push(value) }
      values.push(indices.get(key))
    } catch (e) { failures.push([id, e.message]); const buf = Buffer.from(encoded, 'base64'); const type = proto.read(buf, 0, 'SlotComponentType', {}).value; unknown.push(type); console.error(id, type, String(e)) }
  }
  items[id.replace('minecraft:', '')] = { values, ...(unknown.length ? { unknown } : {}) }
}
// JVM map iteration order is unspecified: sort the dictionary and references.
const order = components.map((component, index) => ({ component, index, key: JSON.stringify(component) })).sort((a, b) => a.key.localeCompare(b.key, 'en'))
const remap = new Map(order.map((entry, index) => [entry.index, index]))
for (const entry of Object.values(items)) {
  entry.values = entry.values.map(index => remap.get(index)).sort((a, b) => a - b)
  entry.unknown?.sort()
}
components.splice(0, components.length, ...order.map(entry => entry.component))
const output = path.resolve(__dirname, '../../lib/data/item_components_26_3.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify({ source: { version: '26.3', protocol: 777, clientSha1: require('crypto').createHash('sha1').update(fs.readFileSync(path.join(base, 'client-26.3.jar'))).digest('hex'), format: 'TypedDataComponent.STREAM_CODEC decoded by SlotComponent; unknown means not encoded or not completely decoded' }, components, items }) + '\n')
console.log({ failures: [...new Set(failures.map(f => f[1]))], items: Object.keys(items).length, components: components.length, unknown: Object.values(items).filter(i => i.unknown).length, size: fs.statSync(output).size })
