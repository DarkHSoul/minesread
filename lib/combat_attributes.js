function attributeValue (attributes, names) {
  const entry = names.map(name => attributes?.[name]).find(Boolean)
  if (!entry || !Number.isFinite(entry.value)) return null
  const modifiers = entry.modifiers || []
  let base = entry.value
  for (const m of modifiers) if (m.operation === 0) base += m.amount
  let result = base
  for (const m of modifiers) if (m.operation === 1) result += base * m.amount
  for (const m of modifiers) if (m.operation === 2) result *= 1 + m.amount
  return Number.isFinite(result) ? result : null
}
module.exports = { attributeValue }
