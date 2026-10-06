import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(process.argv[2])
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]

const box = (node) => {
  const mesh = node.getMesh()
  if (!mesh) return null
  const m = node.getWorldMatrix()
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9]
  let tris = 0
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION')
    const a = pos.getMinNormalized([]), b = pos.getMaxNormalized([])
    tris += (p.getIndices()?.getCount() ?? pos.getCount()) / 3
    for (let c = 0; c < 8; c++) {
      const v = [c & 1 ? b[0] : a[0], c & 2 ? b[1] : a[1], c & 4 ? b[2] : a[2]]
      for (let r = 0; r < 3; r++) {
        const w = m[r] * v[0] + m[r + 4] * v[1] + m[r + 8] * v[2] + m[r + 12]
        min[r] = Math.min(min[r], w); max[r] = Math.max(max[r], w)
      }
    }
  }
  return { min, max, tris }
}

const f = (n) => n.toFixed(1).padStart(7)
let count = 0
const walk = (node, depth) => {
  const b = box(node)
  const pad = '  '.repeat(depth)
  const mats = node.getMesh() ? [...new Set(node.getMesh().listPrimitives().map(p => p.getMaterial()?.getName()))].join('|') : ''
  console.log(
    `${pad}${node.getName() || '(unnamed)'}` +
      (b ? `   tris=${String(Math.round(b.tris)).padStart(7)}  size=[${f(b.max[0]-b.min[0])},${f(b.max[1]-b.min[1])},${f(b.max[2]-b.min[2])}]  y=${f(b.min[1])}..${f(b.max[1])}  mat=${mats}` : '   (group)'),
  )
  count++
  for (const child of node.listChildren()) walk(child, depth + 1)
}
for (const child of scene.listChildren()) walk(child, 0)
console.log('\ntotal nodes printed', count)
