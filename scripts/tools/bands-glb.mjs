// Finds horizontal repetition in a mesh: where the vertices cluster in Y.
// A facade built floor by floor shows one cluster per floor, and the gap
// between them is the floor-to-floor height.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(process.argv[2])
const want = process.argv[3]
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]

const ys = []
scene.traverse((node) => {
  const mesh = node.getMesh()
  if (!mesh || (want && node.getName() !== want)) return
  const m = node.getWorldMatrix()
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    const v = []
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v)
      ys.push(m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13])
    }
  }
})
if (!ys.length) {
  console.log('no vertices for', want)
  process.exit(0)
}
const lo = Math.min(...ys), hi = Math.max(...ys)
const step = 0.1
const bins = new Array(Math.ceil((hi - lo) / step) + 1).fill(0)
for (const y of ys) bins[Math.floor((y - lo) / step)]++
const peak = Math.max(...bins)
const hits = []
for (let i = 1; i < bins.length - 1; i++) {
  if (bins[i] > peak * 0.25 && bins[i] >= bins[i - 1] && bins[i] > bins[i + 1]) hits.push(lo + i * step)
}
const gaps = hits.slice(1).map((y, i) => y - hits[i]).filter((g) => g > 0.5)
gaps.sort((a, b) => a - b)
console.log(`${want ?? 'whole model'}: ${ys.length} verts, y ${lo.toFixed(2)}..${hi.toFixed(2)}`)
console.log('peaks', hits.length, hits.slice(0, 40).map((y) => y.toFixed(2)).join(' '))
console.log('median gap', gaps.length ? gaps[Math.floor(gaps.length / 2)].toFixed(3) : 'n/a', '· gaps', gaps.slice(0, 30).map((g) => g.toFixed(2)).join(' '))
