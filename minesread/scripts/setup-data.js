// Installs the 26.2/26.3 data set into node_modules/minecraft-data.
//
// The npm package `minecraft-data` bundles the data repo as a `minecraft-data/` folder and builds
// `data.js` from it with bin/generate_data.js. Upstream has no 26.2/26.3 data yet, so we swap that
// folder for a pinned commit of the PR branch (PrismarineJS/minecraft-data#1345, a data-only change:
// JSON + proto.yml, reviewed) and regenerate data.js. Re-run after every `npm install`
// (scripts are disabled in .npmrc on purpose):  npm run minesread:setup-data
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const REPO = 'https://github.com/DarkHSoul/minecraft-data.git'
const SHA = '312f3cada17a7d9e2e1a1834fe26f17296163096'

const root = path.join(__dirname, '..') // minesread/
const vendor = path.join(root, 'vendor', 'minecraft-data')
const pkg = path.join(root, '..', 'node_modules', 'minecraft-data') // repo root

const git = (...args) => execFileSync('git', args, { cwd: vendor, stdio: 'pipe' }).toString().trim()

function ensureVendor () {
  if (!fs.existsSync(path.join(vendor, '.git'))) {
    fs.mkdirSync(vendor, { recursive: true })
    execFileSync('git', ['init', '-q', vendor], { stdio: 'pipe' })
    git('remote', 'add', 'origin', REPO)
  }
  let head = ''
  try { head = git('rev-parse', 'HEAD') } catch {}
  if (head !== SHA) {
    console.log(`fetching ${REPO} @ ${SHA.slice(0, 10)}`)
    git('fetch', '-q', '--depth', '1', 'origin', SHA)
    git('checkout', '-q', '--force', 'FETCH_HEAD')
    head = git('rev-parse', 'HEAD')
  }
  if (head !== SHA) throw new Error(`vendor checkout is ${head}, expected ${SHA}`)
  const dirty = git('status', '--porcelain')
  if (dirty) throw new Error('vendor/minecraft-data has local changes; refusing to continue')
}

function install () {
  if (!fs.existsSync(pkg)) throw new Error('run `npm install` first (node_modules/minecraft-data is missing)')
  const dest = path.join(pkg, 'minecraft-data')
  fs.rmSync(path.join(dest, 'data'), { recursive: true, force: true })
  fs.cpSync(path.join(vendor, 'data'), path.join(dest, 'data'), { recursive: true })
  execFileSync(process.execPath, [path.join(pkg, 'bin', 'generate_data.js')], { cwd: pkg, stdio: 'inherit' })
  fs.writeFileSync(path.join(pkg, 'minesread-data.json'), JSON.stringify({ repo: REPO, sha: SHA }, null, 2) + '\n')
}

ensureVendor()
install()
console.log('minecraft-data patched with', SHA.slice(0, 10))
