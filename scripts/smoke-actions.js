// Action smoke test: digging, picking up, placing and pathfinding on a real server (26.3 shifted the
// player-action ids, so these are the paths most likely to break).
//   node scripts/smoke-actions.js [--host localhost] [--port 25565] [--version 26.3]
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d }
const host = arg('host', 'localhost')
const port = Number(arg('port', 25565))
const version = arg('version', '26.3')

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`) }
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${what}`)), ms))])

const bot = mineflayer.createBot({ host, port, version, username: 'minesread-act', auth: 'offline' })
bot.loadPlugin(pathfinder)
let kicked = null
bot.on('kicked', (r) => { kicked = typeof r === 'string' ? r : JSON.stringify(r) })
bot.on('error', (e) => console.log('bot error:', e.message))
let spawned = false
const finish = (code) => { try { bot.quit() } catch {} setTimeout(() => process.exit(code), 300) }
const earlyEnd = () => { if (!spawned) { console.log('FAIL  disconnected before spawn' + (kicked ? ': ' + kicked : '')); finish(1) } }
bot.on('end', earlyEnd)
setTimeout(() => { if (!spawned) { console.log('FAIL  timed out waiting for spawn'); finish(1) } }, 60000)

bot.once('spawn', async () => {
  spawned = true
  try {
    await bot.waitForChunksToLoad()
    await sleep(1000)
    check('spawned', true, `version ${bot.version}`)

    // 1. dig the block in front of / below us (soft block)
    // not the block under our feet: the server refuses to place a block inside a player later
    const me = bot.entity.position
    const soft = bot.findBlock({
      matching: b => ['grass_block', 'dirt', 'sand', 'gravel'].includes(b.name),
      maxDistance: 5,
      useExtraInfo: b => Math.hypot(b.position.x + 0.5 - me.x, b.position.z + 0.5 - me.z) >= 2
    })
    check('finds a diggable block', !!soft, soft && `${soft.name} at ${soft.position}`)
    if (soft) {
      const pos = soft.position.clone()
      await withTimeout(bot.dig(soft), 15000, 'dig')
      await sleep(300)
      const after = bot.blockAt(pos)
      check('digs a block (block_dig start/finish ids)', after && after.name === 'air', after && after.name)

      // 2. pick the drop up
      const drop = Object.values(bot.entities).find(e => e.name === 'item' && e.position.distanceTo(pos) < 3)
      if (drop) {
        await withTimeout(bot.pathfinder.goto(new goals.GoalNear(drop.position.x, drop.position.y, drop.position.z, 0)), 10000, 'walk to drop').catch(() => {})
        await sleep(1500)
      }
      check('picks up the drop', bot.inventory.items().length > 0, bot.inventory.items().map(i => `${i.name}x${i.count}`).join(','))

      // 3. place it back
      const item = bot.inventory.items()[0]
      if (item) {
        // step at least 2 blocks away (GoalInvert): picking up the drop leaves us inside the hole we dug
        bot.pathfinder.setMovements(new Movements(bot))
        await withTimeout(bot.pathfinder.goto(new goals.GoalInvert(new goals.GoalNear(pos.x + 0.5, pos.y, pos.z + 0.5, 2))), 10000, 'step back')
        await bot.equip(item, 'hand')
        const ref = bot.blockAt(pos.offset(0, -1, 0))
        await withTimeout(bot.placeBlock(ref, new Vec3(0, 1, 0)), 8000, 'place')
        await sleep(300)
        const placed = bot.blockAt(pos)
        check('places a block (use_item_on + sequence)', placed && placed.name !== 'air', placed && placed.name)
      }
    }

    // 4. pathfinding
    const mv = new Movements(bot)
    bot.pathfinder.setMovements(mv)
    const start = bot.entity.position.clone()
    const target = start.offset(10, 0, 6)
    let reached = false
    try {
      await withTimeout(bot.pathfinder.goto(new goals.GoalNearXZ(target.x, target.z, 2)), 30000, 'pathfinder goto')
      reached = true
    } catch (e) { console.log('pathfinder:', e.message) }
    const moved = bot.entity.position.distanceTo(start)
    check('pathfinder walks to a goal', reached && moved > 8, `moved ${moved.toFixed(1)} blocks`)

    await sleep(1500)
    check('still connected at the end', !kicked, kicked || '')
  } catch (e) {
    check('no exception', false, e.stack || e.message)
  }
  const bad = results.filter(r => !r.ok).length
  console.log(`\n${results.length - bad}/${results.length} checks passed`)
  finish(bad ? 1 : 0)
})
