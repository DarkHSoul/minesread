// Downloads the official vanilla server jar into ./server/ and verifies it against Mojang's manifest.
//   node scripts/server-setup.js [version] [--accept-eula]
// The Minecraft EULA (https://aka.ms/MinecraftEULA) is NOT accepted unless you pass --accept-eula.
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const acceptEula = args.includes('--accept-eula')
const version = args.find(a => !a.startsWith('--')) || '26.3'
const dir = path.join(__dirname, '..', 'server', version)

async function getJson (url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`)
  return r.json()
}

async function main () {
  const manifest = await getJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
  const entry = manifest.versions.find(v => v.id === version)
  if (!entry) throw new Error(`version ${version} not in Mojang manifest`)
  const meta = await getJson(entry.url)
  const { url, sha1, size } = meta.downloads.server
  console.log(`server ${version}: ${url} (${(size / 1048576).toFixed(1)} MiB), needs Java ${meta.javaVersion.majorVersion}`)

  fs.mkdirSync(dir, { recursive: true })
  const jar = path.join(dir, 'server.jar')
  const have = fs.existsSync(jar) && crypto.createHash('sha1').update(fs.readFileSync(jar)).digest('hex') === sha1
  if (!have) {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`download failed: HTTP ${r.status}`)
    const buf = Buffer.from(await r.arrayBuffer())
    const got = crypto.createHash('sha1').update(buf).digest('hex')
    if (got !== sha1 || buf.length !== size) throw new Error(`checksum mismatch: got ${got} (${buf.length} B), expected ${sha1} (${size} B)`)
    fs.writeFileSync(jar, buf)
    console.log('downloaded and verified sha1', sha1)
  } else {
    console.log('server.jar already present, sha1 verified')
  }

  // Test-server settings: offline mode so the bot needs no Microsoft account, peaceful, small world.
  // Offline mode is insecure, so the server only listens on localhost (server-ip=127.0.0.1).
  const props = [
    'online-mode=false', 'server-ip=127.0.0.1', 'white-list=false', 'enforce-whitelist=false', 'server-port=25565', 'difficulty=peaceful', 'gamemode=survival',
    'level-seed=minesread', 'view-distance=8', 'simulation-distance=6', 'spawn-protection=0',
    'enable-command-block=false', 'motd=minesread test server', 'max-players=4', 'allow-flight=true',
    'level-name=world'
  ].join('\n') + '\n'
  fs.writeFileSync(path.join(dir, 'server.properties'), props)

  if (acceptEula) {
    fs.writeFileSync(path.join(dir, 'eula.txt'), 'eula=true\n')
    console.log('eula.txt written (you passed --accept-eula)')
  } else {
    console.log('eula.txt NOT written. Read https://aka.ms/MinecraftEULA and re-run with --accept-eula to accept.')
  }
  console.log(`start it with: npm run minesread:server   (or: <java 25> -Xmx2G -jar server/${version}/server.jar nogui)`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
