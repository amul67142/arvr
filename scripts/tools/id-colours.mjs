// What colours actually came out of the ID render, and how many pixels each got.
// The renderer's exposure and tone curve sit between the colour we asked a box
// to be and the byte that lands in the PNG, so the palette has to be read back
// rather than assumed.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const dir = process.argv[2]
const want = Number(process.argv[3] ?? 6)
const files = readdirSync(dir).filter((n) => n.endsWith('.png')).sort()
const pick = Array.from({ length: want }, (_, i) => files[Math.round((i * files.length) / want)])

const counts = new Map()
for (const file of pick) {
  const { data, info } = await sharp(join(dir, file)).raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += info.channels) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
}

const colours = [...counts.entries()]
  .map(([key, n]) => ({ r: (key >> 16) & 255, g: (key >> 8) & 255, b: key & 255, n }))
  .sort((a, b) => b.n - a.n)

console.log(`frames sampled: ${pick.join(' ')}`)
console.log(`distinct colours: ${colours.length}`)
console.log('top 12 by area:')
for (const c of colours.slice(0, 12)) console.log(`  ${String(c.r).padStart(3)},${String(c.g).padStart(3)},${String(c.b).padStart(3)}  ${c.n.toLocaleString()} px`)

const big = colours.filter((c) => c.n >= 60)
const levels = (key) => [...new Set(big.map((c) => c[key]))].sort((a, b) => a - b)
console.log(`\ncolours over 60px: ${big.length}`)
console.log('R levels', levels('r').join(' '))
console.log('G levels', levels('g').join(' '))
console.log('B levels', levels('b').join(' '))
