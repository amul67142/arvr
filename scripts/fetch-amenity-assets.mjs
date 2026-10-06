/**
 * Downloads the CC0 models and textures the amenity landscape is dressed with.
 *
 *   node scripts/fetch-amenity-assets.mjs
 *
 * Poly Haven, public domain: nothing here needs a login or carries a licence
 * that stops the renders being handed to a client. Lands in .cache/amenity
 * (git-ignored); already-downloaded files are skipped.
 */
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CACHE = resolve(here, '../.cache/amenity')

const MODELS = [
  // tropical planting: the pool deck and the garden edges
  'island_tree_01', 'island_tree_02', 'island_tree_03', 'jacaranda_tree',
  'pachira_aquatica_01', 'calathea_orbifolia_01', 'fern_02', 'searsia_lucida', 'shrub_02',
  // furniture: poolside, garden, clubhouse
  'vintage_day_bed', 'painted_wooden_bench', 'modular_street_seating', 'wooden_picnic_table',
  'outdoor_table_chair_set_01', 'sofa_02', 'modern_arm_chair_01', 'modern_coffee_table_01',
  'side_table_01', 'potted_plant_02', 'potted_plant_04',
  // edges and light
  'planter_box_01', 'planter_box_02', 'planter_box_03', 'planter_pot_clay', 'street_lamp_01', 'street_lamp_02',
]
const MODEL_RES = '1k'

const TEXTURES = {
  pool_tiles: 'blue_floor_tiles_01',
  pool_deck: 'anti_skid_tiles',
  timber_deck: 'wood_floor_deck',
  track: 'running_track',
  play: 'rubber_tiles',
  gravel: 'clean_pebbles',
}
const TEX_RES = '2k'
const MAPS = { diff: 'Diffuse', nor: 'nor_gl', arm: 'arm' }

const getJson = async (url) => {
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
  const entry = files.gltf?.[MODEL_RES]?.gltf
  if (!entry) throw new Error(`no ${MODEL_RES} glTF`)
  const folder = join(CACHE, 'models', id)
  await download(entry.url, join(folder, `${id}.gltf`))
  for (const [path, file] of Object.entries(entry.include ?? {})) {
    await download(file.url, join(folder, path))
  }
}

async function fetchTexture(name, id) {
  const files = await getJson(`https://api.polyhaven.com/files/${id}`)
  let got = 0
  for (const [ours, theirs] of Object.entries(MAPS)) {
    const url = files[theirs]?.[TEX_RES]?.jpg?.url
    if (!url) continue
    await download(url, join(CACHE, 'textures', name, `${ours}.jpg`))
    got++
  }
  if (!got) throw new Error('no maps')
}

let failed = 0
for (const id of MODELS) {
  try {
    await fetchModel(id)
    console.log(`model   ${id}`)
  } catch (error) {
    failed++
    console.log(`model   ${id}  FAILED ${error.message}`)
  }
}
for (const [name, id] of Object.entries(TEXTURES)) {
  try {
    await fetchTexture(name, id)
    console.log(`texture ${name.padEnd(12)} ${id}`)
  } catch (error) {
    failed++
    console.log(`texture ${name}  FAILED ${error.message}`)
  }
}
console.log(`\ndone · ${failed} failed · ${CACHE}`)
