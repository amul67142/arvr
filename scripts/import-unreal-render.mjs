/**
 * Takes an Unreal render and lays it out as a delivery the pipeline can read.
 *
 *   node scripts/import-unreal-render.mjs --from "<Saved/Renders>" --to public/demo/unreal-tower
 *
 * The beauty frames only need copying. The ID pass needs repairing first: the
 * renderer's tone curve moves every colour (30 came back as 104) and dithering
 * splits each one across two neighbouring bytes, so an exact colour lookup
 * would match nothing.
 *
 * The repair is safe because the curve is monotone and applied per channel. The
 * distinct values that came back, clustered and sorted, line up one for one
 * with the distinct values that went in — so rank tells us which is which, with
 * no assumption about the shape of the curve. Each pixel is then snapped to the
 * palette colour it was meant to be, and the frames become an ordinary ID pass.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const at = args.indexOf(name)
  return at === -1 ? fallback : args[at + 1]
}
const from = opt('--from', 'C:/Users/DELL/Documents/Unreal Projects/TowerRender/Saved/Renders')
const to = opt('--to', 'public/demo/unreal-tower')
const sampleCount = Number(opt('--samples', 8))

const rows = readFileSync(join(from, 'colors.csv'), 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => {
    const [r, g, b, name] = line.split(',')
    return { r: +r, g: +g, b: +b, name }
  })
console.log(`palette: ${rows.length} entries`)

// -- what the renderer actually produced ----------------------------------- --
const idFiles = readdirSync(join(from, 'id')).filter((n) => n.endsWith('.png')).sort()
const sampled = Array.from({ length: sampleCount }, (_, i) => idFiles[Math.round((i * idFiles.length) / sampleCount)])

const seen = [new Set(), new Set(), new Set()]
for (const file of sampled) {
  const { data, info } = await sharp(join(from, 'id', file)).raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += info.channels) {
    if (!data[i] && !data[i + 1] && !data[i + 2]) continue // background
    for (let c = 0; c < 3; c++) seen[c].add(data[i + c])
  }
}

/** Neighbouring bytes are one dithered level, not two. */
const cluster = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const groups = []
  for (const value of sorted) {
    const last = groups[groups.length - 1]
    if (last && value - last[last.length - 1] <= 1) last.push(value)
    else groups.push([value])
  }
  return groups
}

const CHANNEL = ['r', 'g', 'b']
const maps = []
let ok = true
for (let c = 0; c < 3; c++) {
  const wanted = [...new Set(rows.map((row) => row[CHANNEL[c]]))].sort((a, b) => a - b)
  const groups = cluster(seen[c])
  const map = new Uint8Array(256)
  if (groups.length !== wanted.length) {
    ok = false
    console.error(
      `  ${CHANNEL[c]}: ${groups.length} levels came back but ${wanted.length} went in — cannot match by rank`,
    )
  } else {
    groups.forEach((group, index) => {
      for (const value of group) map[value] = wanted[index]
    })
    console.log(`  ${CHANNEL[c]}: ${groups.length} levels matched  (${groups.map((g) => g[0]).join(',')} -> ${wanted.join(',')})`)
  }
  maps.push(map)
}
if (!ok) {
  console.error('\nID pass could not be calibrated. Render more frames or space the palette further apart.')
  process.exit(1)
}

// -- write the repaired ID pass -------------------------------------------- --
mkdirSync(join(to, 'id'), { recursive: true })
mkdirSync(join(to, 'beauty'), { recursive: true })

const known = new Set(rows.map((row) => `${row.r},${row.g},${row.b}`))
let strays = 0
let total = 0
for (const file of idFiles) {
  const { data, info } = await sharp(join(from, 'id', file)).raw().toBuffer({ resolveWithObject: true })
  const out = Buffer.alloc(info.width * info.height * 3)
  for (let i = 0, o = 0; i < data.length; i += info.channels, o += 3) {
    const r = maps[0][data[i]]
    const g = maps[1][data[i + 1]]
    const b = maps[2][data[i + 2]]
    total++
    if (data[i] || data[i + 1] || data[i + 2]) {
      if (!known.has(`${r},${g},${b}`)) {
        strays++
        continue // leave it as background rather than invent a home
      }
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
    }
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(join(to, 'id', file))
}
console.log(`id: ${idFiles.length} frames repaired · ${strays} stray pixels of ${total.toLocaleString()} (${((strays / total) * 100).toFixed(4)}%)`)

// -- beauty, and the palette ------------------------------------------------ --
const beautyFiles = readdirSync(join(from, 'beauty')).filter((n) => /\.jpe?g$/i.test(n)).sort()
for (const file of beautyFiles) {
  copyFileSync(join(from, 'beauty', file), join(to, 'beauty', file.replace(/\.jpeg$/i, '.jpg')))
}
copyFileSync(join(from, 'colors.csv'), join(to, 'colors.csv'))
console.log(`beauty: ${beautyFiles.length} frames copied`)

writeFileSync(
  join(to, 'DELIVERY.md'),
  [
    '# Unreal test delivery',
    '',
    'Rendered locally from a stock high-rise model, to exercise the hotspot',
    'pipeline against a real engine render rather than our own synthetic one.',
    '',
    `- ${beautyFiles.length} beauty frames, ${idFiles.length} ID frames, 1920x1080`,
    `- ${rows.length} named homes, 25 floors`,
    '- The ID pass was tone-curve corrected on import; see scripts/import-unreal-render.mjs',
    '',
    'Not a client asset. Not for publication.',
    '',
  ].join('\n'),
)
console.log(`\nwrote ${to}`)
