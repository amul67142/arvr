/**
 * Draws the baked hotspots back onto the frames they were baked from.
 *
 *   node scripts/verify-hotspots.mjs public/demo/mock --frames 3,9,15
 *   node scripts/verify-hotspots.mjs public/demo/mock --frames 9 --only T1_F18_B_BAL
 *
 * The numbers from build-hotspots --verify say how often a polygon sits on the
 * right object. This says what that looks like. Every delivery gets a sheet,
 * and it is looked at before anything is shown to a client.
 *
 * Writes public/demo/mock/verify/0004.png and so on.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const args = process.argv.slice(2)
const dir = args.find((a) => !a.startsWith('-')) ?? 'public/demo/mock'
const value = (name, fallback) => {
  const at = args.indexOf(name)
  return at === -1 ? fallback : args[at + 1]
}
const only = value('--only', null)
const source = value('--file', 'hotspots.json')
const overlay = value('--against', null) // a second file, drawn on top for comparison
const wanted = value('--frames', null)

const COLOURS = {
  unit: { fill: 'rgba(43,92,255,0.22)', stroke: '#2b5cff' },
  room: { fill: 'rgba(255,92,180,0.30)', stroke: '#ff5cb4' },
  floor: { fill: 'rgba(255,190,60,0.20)', stroke: '#ffbe3c' },
  amenity: { fill: 'rgba(40,200,140,0.20)', stroke: '#28c88c' },
  tower: { fill: 'rgba(255,255,255,0.10)', stroke: '#ffffff' },
}

const file = JSON.parse(readFileSync(join(dir, source), 'utf8'))
const second = overlay ? JSON.parse(readFileSync(join(dir, overlay), 'utf8')) : null
const beautyDir = join(dir, 'beauty')
const beautyFrames = readdirSync(beautyDir).filter((n) => /\.(jpe?g|png|webp)$/i.test(n)).sort()
if (!beautyFrames.length) throw new Error(`no frames in ${beautyDir}`)

const frames = wanted
  ? wanted.split(',').map((n) => Number(n.trim()))
  : [0, Math.floor(file.frameCount / 3), Math.floor((file.frameCount * 2) / 3)]

mkdirSync(join(dir, 'verify'), { recursive: true })

const path = (ring, w, h) =>
  ring.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`).join('') + 'Z'

for (const index of frames) {
  const entry = file.frames.find((f) => f.frame === index)
  if (!entry) {
    console.log(`frame ${index}: no hotspots`)
    continue
  }
  const name = beautyFrames[index]
  if (!name) continue
  const image = sharp(join(beautyDir, name))
  const { width: w, height: h } = await image.metadata()

  const shapes = only ? entry.shapes.filter((s) => s.id === only || s.id.startsWith(`${only}_`)) : entry.shapes
  const parts = []
  for (const shape of shapes) {
    const kind = file.targets[shape.id]?.kind ?? 'tower'
    const colour = COLOURS[kind] ?? COLOURS.tower
    const d = [path(shape.d, w, h), ...(shape.holes ?? []).map((hole) => path(hole, w, h))].join(' ')
    parts.push(
      `<path d="${d}" fill="${only ? 'rgba(43,92,255,0.55)' : colour.fill}" fill-rule="evenodd" ` +
        `stroke="${colour.stroke}" stroke-width="${only ? 2 : 1}" stroke-linejoin="round" />`,
    )
  }

  // Name what is being shown, so a sheet is readable on its own.
  if (only && shapes.length) {
    const [cx, cy] = shapes[0].d
      .reduce(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0])
      .map((sum, i) => (sum / shapes[0].d.length) * (i === 0 ? w : h))
    parts.push(
      `<line x1="${cx}" y1="${cy}" x2="${w - 260}" y2="46" stroke="#ffffff" stroke-width="1.2" />`,
      `<circle cx="${cx}" cy="${cy}" r="4" fill="#ffffff" />`,
      `<rect x="${w - 264}" y="24" width="248" height="34" rx="4" fill="rgba(10,10,10,0.82)" />`,
      `<text x="${w - 252}" y="47" fill="#ffffff" font-family="Arial" font-size="17">${only}</text>`,
    )
  } else {
    const counts = shapes.reduce((map, s) => {
      const kind = file.targets[s.id]?.kind ?? 'tower'
      map.set(kind, (map.get(kind) ?? 0) + 1)
      return map
    }, new Map())
    const legend = [...counts.entries()].map(([kind, n]) => `${n} ${kind}`).join('   ')
    parts.push(
      `<rect x="16" y="16" width="${20 + legend.length * 9}" height="32" rx="4" fill="rgba(10,10,10,0.78)" />`,
      `<text x="28" y="38" fill="#ffffff" font-family="Arial" font-size="15">${legend}</text>`,
    )
  }

  // A second file drawn as outlines only, to compare two producers.
  if (second) {
    const entry2 = second.frames.find((f) => f.frame === index)
    const shapes2 = entry2
      ? only
        ? entry2.shapes.filter((s) => s.id === only || s.id.startsWith(`${only}_`))
        : entry2.shapes
      : []
    for (const shape of shapes2) {
      const d = [path(shape.d, w, h), ...(shape.holes ?? []).map((hole) => path(hole, w, h))].join(' ')
      parts.push(`<path d="${d}" fill="none" stroke="#28c88c" stroke-width="1.6" stroke-dasharray="5 3" />`)
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join('')}</svg>`
  const out = join(
    dir,
    'verify',
    `${String(index + 1).padStart(4, '0')}${only ? `-${only}` : ''}${second ? '-compare' : ''}.png`,
  )
  await image.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(out)
  console.log(`${out} · ${shapes.length} shapes`)
}

if (!existsSync(join(dir, 'verify'))) console.log('nothing written')
