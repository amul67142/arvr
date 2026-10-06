import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/core'
import { MeshoptDecoder } from 'meshoptimizer'
await MeshoptDecoder.ready
const path = process.argv[2]
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(path)
const root = doc.getRoot()
console.log('extensions used:', root.listExtensionsUsed().map(e => e.extensionName), 'required:', root.listExtensionsRequired().map(e=>e.extensionName))
console.log('asset:', JSON.stringify(root.getAsset()))
const scene = root.getDefaultScene() ?? root.listScenes()[0]
console.log('scenes', root.listScenes().length, 'default?', !!root.getDefaultScene())
console.log('bounds', JSON.stringify(getBounds(scene)))
const top = scene.listChildren()
console.log('top nodes', top.length, top.slice(0,8).map(n => [n.getName(), n.getTranslation().map(v=>+v.toFixed(2)), n.getRotation().map(v=>+v.toFixed(3)), n.getScale().map(v=>+v.toFixed(4))]))
let tris = 0, verts = 0
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); const pos = p.getAttribute('POSITION'); verts += pos.getCount(); tris += (i ? i.getCount() : pos.getCount()) / 3; }
console.log('meshes', root.listMeshes().length, 'nodes', root.listNodes().length, 'verts', verts, 'tris', Math.round(tris))
const mats = root.listMaterials()
console.log('materials', mats.length)
const alpha = {}; for (const m of mats) { const k = m.getAlphaMode() + (m.getBaseColorFactor()[3] < 1 ? ' a<1' : '') ; alpha[k] = (alpha[k]||0)+1 }
console.log('alpha modes', alpha)
console.log('sample mats', mats.slice(0,12).map(m => [m.getName(), m.getBaseColorFactor().map(v=>+v.toFixed(2)), m.getAlphaMode(), !!m.getBaseColorTexture(), m.getDoubleSided()]))
const tex = root.listTextures()
let texBytes = 0; const mimes = {}; const sizes=[]
for (const t of tex) { texBytes += t.getImage()?.byteLength ?? 0; mimes[t.getMimeType()] = (mimes[t.getMimeType()]||0)+1; sizes.push(t.getSize()?.join('x')) }
console.log('textures', tex.length, 'MB', (texBytes/1e6).toFixed(1), mimes, 'sizes', [...new Set(sizes)].slice(0,10))
const noNormals = root.listMeshes().flatMap(m=>m.listPrimitives()).filter(p=>!p.getAttribute('NORMAL')).length
console.log('prims without normals', noNormals, 'modes', [...new Set(root.listMeshes().flatMap(m=>m.listPrimitives()).map(p=>p.getMode()))])
console.log('cameras', root.listCameras().length, 'lights ext?', root.listExtensionsUsed().some(e=>e.extensionName.includes('light')))
