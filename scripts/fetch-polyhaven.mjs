/**
 * Downloads the CC0 models and textures the demo scenes are built from.
 *
 *   node scripts/fetch-polyhaven.mjs
 *
 * Source: Poly Haven (https://polyhaven.com) — every asset is CC0, public
 * domain, no login and no attribution required. Credits are still recorded in
 * public/demo/CREDITS.md because that is the right thing to do.
 *
 * Files land in .cache/polyhaven (git-ignored). Already-downloaded files are
 * skipped, so re-running is cheap. The build scripts read from this cache.
 */
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const CACHE = resolve(here, '../.cache/polyhaven')
const RESOLUTION = '1k'

/** Furniture, decor and landscaping. */
export const MODELS = [
  // living & dining
  'sofa_02',
  'modern_arm_chair_01',
  'mid_century_lounge_chair',
  'modern_coffee_table_01',
  'side_table_01',
  'side_table_tall_01',
  'throw_pillows_01',
  'dining_table',
  'dining_chair_02',
  'ceiling_fan',
  'modern_ceiling_lamp_01',
  'potted_plant_02',
  'potted_plant_04',
  'ceramic_vase_02',
  'standing_picture_frame_01',
  'hanging_picture_frame_01',
  'hanging_picture_frame_02',
  'brass_diya_lantern',
  'desk_lamp_arm_01',
  // balconies
  'outdoor_table_chair_set_01',
  'planter_box_01',
  'exterior_aircon_unit',
  // grounds & amenities
  'shrub_02',
  'street_lamp_01',
  'modular_street_seating',
  'wooden_picnic_table',
  'plastic_monobloc_chair_01',
  'painted_wooden_bench',
  'planter_box_02',
]

/** Surfaces. `arm` packs AO / roughness / metalness in glTF's ORM layout. */
export const TEXTURES = [
  'marble_01', // living, dining, foyer — light Italian-style marble
  'marble_tiles',
  'oak_wood_planks', // bedrooms
  'herringbone_parquet', // master bedroom
  'large_grey_tiles', // kitchen floor
  'granite_tile', // kitchen counter
  'anti_skid_tiles', // bathroom floors
  'long_white_tiles', // bathroom walls
  'wood_floor_deck', // balconies, pool deck
  'white_plaster_02', // interior walls
  'leafy_grass', // lawns
  'patio_tiles', // garden paths
  'hexagonal_concrete_paving', // entrance plaza
  'rubber_tiles', // playground surface
  'rubberized_track', // jogging track
  'blue_floor_tiles_01', // pool lining
  'asphalt_02', // driveway
  'red_sandstone_tiles', // clubhouse forecourt
  'concrete_floor_02', // courts, service areas
]

const MAPS = { diff: 'Diffuse', nor_gl: 'nor_gl', arm: 'arm', rough: 'Rough' }

async function getJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.json()
}

async function download(url, target) {
  if (existsSync(target)) return 'cached'
  mkdirSync(dirname(target), { recursive: true })
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target))
  return 'downloaded'
}

async function fetchModel(id) {
  const files = await getJson(`https://api.polyhaven.com/files/${id}`)
  const entry = files.gltf?.[RESOLUTION]?.gltf
  if (!entry) throw new Error(`no ${RESOLUTION} glTF for ${id}`)

  const folder = join(CACHE, 'models', id)
  const jobs = [download(entry.url, join(folder, `${id}.gltf`))]
  for (const [path, file] of Object.entries(entry.include ?? {})) {
    jobs.push(download(file.url, join(folder, path)))
  }
  const results = await Promise.all(jobs)
  return results.includes('downloaded') ? 'downloaded' : 'cached'
}

async function fetchTexture(id) {
  const files = await getJson(`https://api.polyhaven.com/files/${id}`)
  const folder = join(CACHE, 'textures', id)
  const jobs = []
  for (const [name, key] of Object.entries(MAPS)) {
    const url = files[key]?.[RESOLUTION]?.jpg?.url
    if (url) jobs.push(download(url, join(folder, `${name}.jpg`)))
  }
  if (jobs.length === 0) throw new Error(`no maps for ${id}`)
  const results = await Promise.all(jobs)
  return results.includes('downloaded') ? 'downloaded' : 'cached'
}

/** Small worker pool: polite to the CDN, fast enough for ~50 assets. */
async function runPool(items, worker, size = 6) {
  const queue = [...items]
  const failures = []
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) {
        const item = queue.shift()
        try {
          const status = await worker(item)
          console.log(`  ${status.padEnd(10)} ${item}`)
        } catch (error) {
          failures.push(item)
          console.log(`  FAILED     ${item} — ${error.message}`)
        }
      }
    }),
  )
  return failures
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  console.log(`Poly Haven → ${CACHE}\n\nmodels (${MODELS.length})`)
  const failedModels = await runPool(MODELS, fetchModel)
  console.log(`\ntextures (${TEXTURES.length})`)
  const failedTextures = await runPool(TEXTURES, fetchTexture)

  writeFileSync(
    join(CACHE, 'manifest.json'),
    JSON.stringify({ fetchedAt: new Date().toISOString(), MODELS, TEXTURES }, null, 2),
  )

  const failed = [...failedModels, ...failedTextures]
  console.log(failed.length ? `\n${failed.length} failed: ${failed.join(', ')}` : '\nall assets ready')
  process.exitCode = failed.length ? 1 : 0
}
