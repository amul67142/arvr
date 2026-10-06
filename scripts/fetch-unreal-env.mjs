/**
 * Downloads the CC0 sky and ground textures the Unreal site is built from.
 *
 *   node scripts/fetch-unreal-env.mjs
 *
 * Poly Haven, same as the rest of the demo scenes: public domain, no login,
 * no attribution required, and — the part that matters for a client build —
 * nothing in the licence that stops the renders being handed over. Marketplace
 * and Fab assets do not allow that as freely.
 *
 * Files land in .cache/unreal-env, which is git-ignored, and re-running skips
 * whatever is already there.
 */
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CACHE = resolve(here, '../.cache/unreal-env')

const HDRI = 'kloofendal_48d_partly_cloudy_puresky'
const HDRI_RES = '4k'
const TEX_RES = '2k'

// what it is -> the Poly Haven slug
const TEXTURES = {
  asphalt: 'asphalt_02',
  paving: 'concrete_pavement',
  concrete: 'concrete_floor',
  grass: 'aerial_grass_rock',
}
// our name -> Poly Haven's map key
const MAPS = { diff: 'Diffuse', nor: 'nor_gl', rough: 'Rough', arm: 'arm', ao: 'AO' }

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

// -- sky -------------------------------------------------------------------- --
const hdriFiles = await getJson(`https://api.polyhaven.com/files/${HDRI}`)
const hdriUrl = hdriFiles.hdri?.[HDRI_RES]?.hdr?.url
if (!hdriUrl) throw new Error(`no ${HDRI_RES} hdr for ${HDRI}`)
console.log(`sky  ${HDRI} ${HDRI_RES}  ${await download(hdriUrl, join(CACHE, 'sky.hdr'))}`)

// -- ground ----------------------------------------------------------------- --
for (const [name, id] of Object.entries(TEXTURES)) {
  const files = await getJson(`https://api.polyhaven.com/files/${id}`)
  const got = []
  for (const [ours, theirs] of Object.entries(MAPS)) {
    const url = files[theirs]?.[TEX_RES]?.jpg?.url
    if (!url) continue
    await download(url, join(CACHE, name, `${ours}.jpg`))
    got.push(ours)
  }
  if (!got.length) throw new Error(`no maps for ${id}`)
  console.log(`${name.padEnd(9)} ${id.padEnd(20)} ${got.join(' ')}`)
}

console.log(`\ncached in ${CACHE}`)
