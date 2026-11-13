// Starts the test server in ./server/<version> with a Java that is new enough (26.x needs Java 25).
//   node scripts/run-server.js [version]
// Java is taken from $MINESREAD_JAVA, else Prism Launcher's java-runtime-epsilon (Java 25), else `java`.
const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const version = process.argv[2] || '26.3'
const dir = path.join(__dirname, '..', 'server', version)
if (!fs.existsSync(path.join(dir, 'server.jar'))) { console.error('server.jar missing: run `npm run server:setup` first'); process.exit(1) }
if (!fs.existsSync(path.join(dir, 'eula.txt'))) { console.error('eula.txt missing: accept the EULA with `npm run server:setup -- --accept-eula`'); process.exit(1) }

const candidates = [
  process.env.MINESREAD_JAVA,
  process.env.APPDATA && path.join(process.env.APPDATA, 'PrismLauncher', 'java', 'java-runtime-epsilon', 'bin', 'java.exe'),
  'java'
].filter(Boolean)

let java = null
for (const c of candidates) {
  const r = spawnSync(c, ['-version'], { encoding: 'utf8' })
  const m = Number(/version "(\d+)/.exec((r.stderr || '') + (r.stdout || ''))?.[1])
  if (m >= 25) { java = c; break }
}
if (!java) { console.error('No Java 25+ found. Set MINESREAD_JAVA to a Java 25 java.exe.'); process.exit(1) }
console.log('using', java)

const child = spawn(java, ['-Xmx2G', '-jar', 'server.jar', 'nogui'], { cwd: dir, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
process.on('SIGINT', () => child.stdin && child.kill('SIGINT'))
