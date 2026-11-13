const { isDeepStrictEqual } = require('util')
const vanilla = require('./data/item_components_26_3.json')
const normalize = type => (typeof type === 'string' ? type : type?.type)?.replace(/^minecraft:/, '')

// A prismarine-item component list is a patch. Keep unknown defaults distinct
// from a known absent component, including explicit removals.
function resolveItemComponent (registry, item, type) {
  type = normalize(type)
  if (!item) return { known: true, present: false }
  if (item.removedComponents?.some(component => normalize(component) === type)) return { known: true, present: false }
  const patch = item.components?.find(component => normalize(component) === type)
  if (patch) return { known: true, present: true, value: patch.data }
  const name = item.name ?? registry.items[item.type ?? item.id]?.name
  if (registry.version.minecraftVersion !== '26.3') return { known: false, present: false }
  const defaults = vanilla.items[name?.replace(/^minecraft:/, '')]
  if (!defaults || defaults.unknown?.includes(type)) return { known: false, present: false }
  const component = defaults.values.map(index => vanilla.components[index]).find(component => component.type === type)
  return component ? { known: true, present: true, value: structuredClone(component.data) } : { known: true, present: false }
}

function matchesComponentPredicate (registry, item, components) {
  return (components ?? []).every(component => {
    const actual = resolveItemComponent(registry, item, component.type)
    return actual.known && actual.present && isDeepStrictEqual(actual.value, component.data)
  })
}

function getItemStackSize (registry, item) {
  const component = resolveItemComponent(registry, item, 'max_stack_size')
  return component.known ? (component.present ? component.value : 1) : item.stackSize
}

function getItemMaxDurability (registry, item) {
  const component = resolveItemComponent(registry, item, 'max_damage')
  return component.known ? (component.present ? component.value : 0) : item.maxDurability
}

function getItemDamage (registry, item) {
  const component = resolveItemComponent(registry, item, 'damage')
  if (!component.known) return item.durabilityUsed
  return Math.max(0, Math.min(component.present ? component.value : 0, getItemMaxDurability(registry, item) ?? 0))
}

module.exports = { resolveItemComponent, matchesComponentPredicate, getItemStackSize, getItemMaxDurability, getItemDamage }
