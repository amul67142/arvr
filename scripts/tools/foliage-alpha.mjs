// Poly Haven's glTF exports name the leaf texture "leaves_diff-leaves_alpha" -
// colour and cut-out, combined - but ship only the colour JPEG. The alpha map
// is a separate download the glTF never references, so in any engine the
// leaves either render as solid cards or vanish entirely.
//
// This fetches the missing alpha for every non-opaque material, bakes it into
// the colour map as a real RGBA PNG, and writes a manifest the Unreal side
// reads to build proper masked foliage materials.
//
//   node scripts/tools/foliage-alpha.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const ROOT = resolve('.cache/amenity')
const OUT = join(ROOT, 'foliage')
const RES = '1k'
const MODELS = [
  'island_tree_01', 'island_tree_02', 'island_tree_03', 'jacaranda_tree',
  'shrub_02', 'searsia_lucida', 'fern_02', 'potted_plant_02',
]
mkdirSync(OUT, { recursive: true })

const manifest = []
for (const id of MODELS) {
  const folder = join(ROOT, 'models', id)
  const gltf = JSON.parse(readFileSync(join(folder, `${id}.gltf`), 'utf8'))
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json()

  for (const material of gltf.materials ?? []) {
    if (!material.alphaMode || material.alphaMode === 'OPAQUE') continue
    const colourIndex = material.pbrMetallicRoughness?.baseColorTexture?.index
    if (colourIndex === undefined) continue
    const colourFile = join(folder, gltf.images[gltf.textures[colourIndex].source].uri)
    const normalIndex = material.normalTexture?.index
    const normalFile = normalIndex === undefined ? null : join(folder, gltf.images[gltf.textures[normalIndex].source].uri)

    // leaves -> leaves_alpha, twigs -> twigs_alpha, whole-model -> Alpha
    const part = material.name.replace(`${id}_`, '').replace(id, '')
    const key = [`${part}_alpha`, 'Alpha', 'leaves_alpha'].find((k) => files[k]?.[RES])
    if (!key) {
      console.log(`${id} ${material.name}: no alpha map published`)
      continue
    }
    const formats = files[key][RES]
    const url = (formats.png ?? formats.jpg ?? Object.values(formats)[0]).url
    const alphaFile = join(OUT, `${id}__${key}.${url.split('.').pop()}`)
    if (!existsSync(alphaFile)) {
      writeFileSync(alphaFile, Buffer.from(await (await fetch(url)).arrayBuffer()))
    }

    const colour = sharp(colourFile)
    const { width, height } = await colour.metadata()
    const rgb = await colour.removeAlpha().raw().toBuffer()
    const alpha = await sharp(alphaFile).resize(width, height).extractChannel(0).raw().toBuffer()
    const rgba = Buffer.alloc(width * height * 4)
    for (let i = 0, j = 0, k = 0; k < alpha.length; i += 3, j += 4, k++) {
      rgba[j] = rgb[i]
      rgba[j + 1] = rgb[i + 1]
      rgba[j + 2] = rgb[i + 2]
      rgba[j + 3] = alpha[k]
    }
    const rgbaFile = join(OUT, `${id}__${material.name}.png`)
    await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(rgbaFile)

    let opaque = 0
    for (const a of alpha) if (a > 127) opaque++
    manifest.push({ model: id, material: material.name, rgba: rgbaFile.replaceAll('\\', '/'),
                    normal: normalFile ? normalFile.replaceAll('\\', '/') : null })
    console.log(`${id.padEnd(16)} ${material.name.padEnd(28)} ${key.padEnd(13)} ${width}x${height}  ${((opaque / alpha.length) * 100).toFixed(0)}% leaf`)
  }
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`\n${manifest.length} foliage materials · ${OUT}`)
