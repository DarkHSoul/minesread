// Probe: what can a Mineflayer client actually see on this server? Prints one line per data source.
//   node scripts/probe.js [--host localhost] [--port 25565] [--version 26.3]
const mineflayer = require('../..')
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d }
const bot = mineflayer.createBot({ host: arg('host', 'localhost'), port: Number(arg('port', 25565)), version: arg('version', '26.3'), username: 'minesread-probe', auth: 'offline' })
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const out = (k, v) => console.log(k.padEnd(34), typeof v === 'string' ? v : JSON.stringify(v))
const attempt = (k, fn) => { try { out(k, fn()) } catch (e) { out(k, 'ERROR ' + e.message) } }

const packets = {}
bot._client.on('packet', (_d, meta) => { packets[meta.name] = (packets[meta.name] || 0) + 1 })

bot.once('spawn', async () => {
  await bot.waitForChunksToLoad(); await sleep(2500)
  const p = bot.entity.position
  console.log('--- self')
  attempt('position / yaw / pitch', () => ({ p: p.floored(), yaw: +bot.entity.yaw.toFixed(2), pitch: +bot.entity.pitch.toFixed(2) }))
  attempt('velocity / onGround', () => ({ v: bot.entity.velocity, onGround: bot.entity.onGround }))
  attempt('health / food / saturation / oxygen', () => ({ hp: bot.health, food: bot.food, sat: bot.foodSaturation, oxygen: bot.oxygenLevel }))
  attempt('xp', () => bot.experience)
  attempt('effects', () => bot.entity.effects)
  attempt('game (mode, dimension, difficulty)', () => ({ mode: bot.game.gameMode, dim: bot.game.dimension, diff: bot.game.difficulty, hardcore: bot.game.hardcore, maxPlayers: bot.game.maxPlayers }))
  attempt('inventory / held / quickBar', () => ({ items: bot.inventory.items().length, held: bot.heldItem && bot.heldItem.name, slot: bot.quickBarSlot }))
  console.log('--- world')
  attempt('time / day / raining / thunder', () => ({ timeOfDay: bot.time.timeOfDay, day: bot.time.day, rain: bot.isRaining, rainLevel: bot.rainState, thunder: bot.thunderState }))
  const here = bot.blockAt(p)
  attempt('block at feet: name/light/biome', () => ({ name: here.name, skyLight: here.skyLight, blockLight: here.light, biome: here.biome && here.biome.name }))
  attempt('block under cursor (raycast)', () => { const b = bot.blockAtCursor(6); return b && { name: b.name, pos: b.position } })
  attempt('loaded chunk columns', () => Object.keys(bot.world.getColumns ? bot.world.getColumns() : {}).length)
  attempt('blocks within 32: ore/water/lava/log counts', () => {
    const count = (names) => bot.findBlocks({ matching: names.map(n => bot.registry.blocksByName[n]).filter(Boolean).map(b => b.id), maxDistance: 32, count: 5000 }).length
    return { coal_ore: count(['coal_ore', 'deepslate_coal_ore']), iron_ore: count(['iron_ore', 'deepslate_iron_ore']), water: count(['water']), lava: count(['lava']), logs: count(['oak_log', 'birch_log', 'spruce_log']) }
  })
  attempt('entities by kind (all loaded)', () => { const c = {}; for (const e of Object.values(bot.entities)) c[e.name || e.type] = (c[e.name || e.type] || 0) + 1; return c })
  attempt('entity detail sample', () => { const e = Object.values(bot.entities).find(x => x !== bot.entity && (x.type === 'animal' || x.type === 'mob' || x.type === 'hostile')); return e && { name: e.name, pos: e.position.floored(), state: bot.getEntityState?.(e), metadata: Object.keys(e.metadata || {}).length + ' fields', equipment: (e.equipment || []).filter(Boolean).length } })
  attempt('players online / scoreboard / teams', () => ({ players: Object.keys(bot.players), scoreboards: Object.keys(bot.scoreboards || {}), teams: Object.keys(bot.teams || {}) }))
  attempt('recipes (crafting table) for planks', () => bot.recipesAll(bot.registry.itemsByName.oak_planks.id, null, true).length + ' recipes')
  attempt('registry: blocks/items/entities/biomes', () => ({ blocks: Object.keys(bot.registry.blocksByName).length, items: Object.keys(bot.registry.itemsByName).length, entities: Object.keys(bot.registry.entitiesByName).length, biomes: Object.keys(bot.registry.biomesByName || {}).length, enchantments: Object.keys(bot.registry.enchantmentsByName || {}).length, foods: Object.keys(bot.registry.foodsByName || {}).length }))
  attempt('block collision shapes / hardness', () => { const b = bot.registry.blocksByName.obsidian; return { obsidianHardness: b.hardness, stone: bot.registry.blocksByName.stone.hardness, shapes: bot.registry.blockCollisionShapes ? 'present' : 'absent' } })
  console.log('--- chat / commands')
  attempt('can run commands (op)?', () => 'unknown until a command is tried')
  bot.chat('/time query daytime'); await sleep(800)
  console.log('--- raw packets the server sent (name: count), top 25')
  console.log(Object.entries(packets).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k}:${v}`).join('  '))
  out('distinct packet types seen', Object.keys(packets).length)
  console.log('--- NOT visible to a client (checked by absence)')
  out('has packet with seed / structures?', Object.keys(packets).filter(k => /seed|structure|loot/i.test(k)))
  bot.quit(); setTimeout(() => process.exit(0), 300)
})
bot.on('message', (m) => console.log('[chat]', m.toString().slice(0, 120)))
bot.on('kicked', r => console.log('kicked', JSON.stringify(r)))
bot.on('error', e => console.log('error', e.message))
setTimeout(() => process.exit(2), 60000)
