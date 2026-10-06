// Groups a processed interior's furniture meshes into pieces by overlapping
// bounds, so they can be lifted out as whole items. Prints each cluster.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(process.argv[2])
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
const items = []
scene.traverse((node) => {
  const mesh = node.getMesh(); if (!mesh) return
  const m = node.getWorldMatrix(); const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9]; let tris = 0
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION'); const a = pos.getMinNormalized([]), b = pos.getMaxNormalized([]); tris += (p.getIndices()?.getCount() ?? pos.getCount()) / 3
    for (let c = 0; c < 8; c++) { const v = [c & 1 ? b[0] : a[0], c & 2 ? b[1] : a[1], c & 4 ? b[2] : a[2]]; for (let r = 0; r < 3; r++) { const w = m[r] * v[0] + m[r + 4] * v[1] + m[r + 8] * v[2] + m[r + 12]; min[r] = Math.min(min[r], w); max[r] = Math.max(max[r], w) } }
  }
  items.push({ name: node.getName(), min, max, tris })
})
const skip = /^(Wall|Floor|Ceiling|Slab|Rug|Curtain)_/
const furn = items.filter((it) => !skip.test(it.name))
const pad = 0.03
const touch = (a, b) => [0, 1, 2].every((k) => a.min[k] - pad <= b.max[k] && b.min[k] - pad <= a.max[k])
const clusters = []
for (const it of furn) {
  const hits = clusters.filter((c) => c.items.some((o) => touch(o, it)))
  const merged = { items: [it, ...hits.flatMap((c) => c.items)] }
  for (const h of hits) clusters.splice(clusters.indexOf(h), 1)
  clusters.push(merged)
}
for (const c of clusters) {
  c.min = [0, 1, 2].map((k) => Math.min(...c.items.map((i) => i.min[k])))
  c.max = [0, 1, 2].map((k) => Math.max(...c.items.map((i) => i.max[k])))
}
clusters.sort((a, b) => a.min[0] - b.min[0])
const f = (v) => v.map((x) => x.toFixed(2)).join(',')
for (const c of clusters) {
  const kinds = {}; for (const i of c.items) { const k = i.name.split('_')[0]; kinds[k] = (kinds[k] || 0) + 1 }
  console.log(`[${f(c.min)}] → [${f(c.max)}]  size ${f(c.max.map((v, k) => v - c.min[k]))}  ${c.items.length} meshes ${JSON.stringify(kinds)}`)
}
console.log('walls/curtains/etc:')
for (const it of items.filter((it) => skip.test(it.name))) console.log(' ', it.name, `[${f(it.min)}] → [${f(it.max)}]`)
