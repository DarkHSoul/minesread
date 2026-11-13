// This package ships CommonJS source. Build validates it and packs a local
// distribution; it never publishes, runs Minecraft, or accepts the EULA.
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const root = path.resolve(__dirname, '../..')
const outputIndex = process.argv.indexOf('--out')
const output = path.resolve(outputIndex < 0 ? path.join(root, 'dist') : process.argv[outputIndex + 1])
const npm = process.env.npm_execpath
if (!npm) throw new Error('Run this script with npm run build')
function run (args, capture = false) {
  return execFileSync(process.execPath, [npm, ...args], { cwd: root, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' })
}
const parse = file => new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file })
function syntaxCheck (dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) syntaxCheck(file)
    else if (entry.name.endsWith('.js')) parse(file)
  }
}
syntaxCheck(path.join(root, 'lib'))
parse(path.join(root, 'index.js'))
for (const check of ['lint', 'typecheck:api', 'test:api', 'test:26.3']) run(['run', check])
fs.mkdirSync(output, { recursive: true })
const [pack] = JSON.parse(run(['pack', '--ignore-scripts', '--json', '--pack-destination', output], true))
const forbidden = pack.files.filter(f => /(^|\/)(node_modules|vendor|server|\.git)(\/|$)|\.jar$/.test(f.path))
if (forbidden.length) throw new Error(`Unexpected packaged files: ${forbidden.map(f => f.path).join(', ')}`)
const archive = path.join(output, pack.filename)
const manifest = {
  name: pack.name,
  version: pack.version,
  archive: pack.filename,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),
  bytes: fs.statSync(archive).size,
  minecraftVersion: '26.3',
  protocol: 777,
  clientJarSha1: 'e877b6a07acd633fb3bb475002175cec036e7b87',
  checks: ['syntax', 'lint', 'typecheck:api (skipLibCheck)', 'test:api', 'test:26.3'],
  dependenciesBundled: false,
  files: pack.files.map(f => f.path)
}
fs.writeFileSync(path.join(output, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Built ${archive}\nSHA-256 ${manifest.sha256}`)
