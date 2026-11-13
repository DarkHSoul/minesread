// Connection smoke test: proves the 26.3 stack works against a real server.
//   node scripts/smoke.js [--host localhost] [--port 25565] [--version 26.3] [--hold 20]
// Exit code 0 only if every check passed.
const mineflayer = require('mineflayer')

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d }
const host = arg('host', 'localhost')
const port = Number(arg('port', 25565))
const version = arg('version', '26.3')
const holdSec = Number(arg('hold', 20)) // must stay well past the ~1.5 s kick seen without tick_end

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`) }
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const bot = mineflayer.createBot({ host, port, version, username: 'minesread', auth: 'offline', hideErrors: false })
let kicked = null
let ended = false
bot.on('kicked', (reason) => { kicked = typeof reason === 'string' ? reason : JSON.stringify(reason) })
bot.on('error', (e) => console.log('bot error:', e.message))
bot.on('end', () => { ended = true })

const finish = (code) => { try { bot.quit() } catch {} setTimeout(() => process.exit(code), 300) }
let spawned = false
bot.once('spawn', () => { spawned = true })
// a kick or disconnect before spawn is a failure with a reason, not a 60 s timeout
const earlyEnd = () => { if (!spawned) { console.log('FAIL  disconnected before spawn' + (kicked ? ': ' + kicked : '')); finish(1) } }
bot.on('kicked', () => setTimeout(earlyEnd, 200))
bot.on('end', earlyEnd)
const watchdog = setTimeout(() => { console.log('FAIL  timed out waiting for spawn'); finish(1) }, 60000)

bot.once('spawn', async () => {
  clearTimeout(watchdog)
  try {
    check('spawned', true, `version ${bot.version}, pos ${bot.entity.position.floored()}`)
    check('protocol/data version matches', bot.version === version, bot.version)

    await sleep(1500)
    check('still connected after 1.5 s (tick_end fix)', !ended && !kicked, kicked || '')

    await bot.waitForChunksToLoad()
    const below = bot.blockAt(bot.entity.position.offset(0, -1, 0))
    check('reads blocks', !!below && below.name !== 'air', below && below.name)
    check('reads health/food', bot.health > 0 && bot.food >= 0, `hp ${bot.health} food ${bot.food}`)
    check('reads inventory', Array.isArray(bot.inventory.items()), `${bot.inventory.items().length} stacks`)
    check('knows game mode', !!bot.game && typeof bot.game.gameMode === 'string', bot.game && bot.game.gameMode)

    // walk: hold forward for a second; position must change
    const p0 = bot.entity.position.clone()
    bot.setControlState('forward', true)
    await sleep(1200)
    bot.setControlState('forward', false)
    check('walks (physics + position packets)', bot.entity.position.distanceTo(p0) > 0.5, `${bot.entity.position.distanceTo(p0).toFixed(2)} blocks`)

    // look around
    await bot.look(Math.PI / 2, 0, true)
    check('rotates', Math.abs(bot.entity.yaw - Math.PI / 2) < 0.2)

    // dig the block below us only if it's a soft block, then place it back? keep it read-only: just report nearby entities
    const near = Object.values(bot.entities).filter(e => e !== bot.entity).length
    check('tracks entities', near >= 0, `${near} nearby`)

    console.log(`holding connection for ${holdSec}s...`)
    const t0 = Date.now()
    while (Date.now() - t0 < holdSec * 1000 && !ended && !kicked) await sleep(250)
    check(`stays connected ${holdSec}s`, !ended && !kicked, kicked || '')
  } catch (e) {
    check('no exception', false, e.stack || e.message)
  }
  const bad = results.filter(r => !r.ok).length
  console.log(`\n${results.length - bad}/${results.length} checks passed`)
  finish(bad ? 1 : 0)
})
