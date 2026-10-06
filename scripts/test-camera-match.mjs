/**
 * A regression test for the camera solver.
 *
 *   node scripts/test-camera-match.mjs public/demo/mock
 *
 * The synthetic delivery is correct, so the only way to test the solver is to
 * break it on purpose. Each case corrupts the delivery the way a real export
 * does — a lens that disagrees with the render, a Z-up proxy, a proxy in
 * centimetres — and checks that the solver finds its way back.
 *
 * Run it after touching scripts/lib/camera-match.mjs.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { NodeIO } from '@gltf-transform/core'

import { solveCamera } from './lib/camera-match.mjs'

const dir = process.argv[2] ?? 'public/demo/mock'
if (!existsSync(join(dir, 'camera.json'))) throw new Error(`no delivery in ${dir}`)

const camera = JSON.parse(readFileSync(join(dir, 'camera.json'), 'utf8'))

// -- the proxy, as delivered ------------------------------------------------ --

const doc = await new NodeIO().read(join(dir, 'proxy.glb'))
const objects = []
const walk = (node, parent) => {
  const world = new Matrix4().multiplyMatrices(
    parent,
    new Matrix4().compose(
      new Vector3(...node.getTranslation()),
      new Quaternion(...node.getRotation()),
      new Vector3(...node.getScale()),
    ),
  )
  const mesh = node.getMesh()
  if (mesh) {
    const points = []
    const tris = []
    const v = new Vector3()
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION')
      const indices = prim.getIndices()
      if (!position) continue
      const start = points.length
      for (let i = 0; i < position.getCount(); i++) {
        const [x, y, z] = position.getElement(i, [0, 0, 0])
        v.set(x, y, z).applyMatrix4(world)
        points.push([v.x, v.y, v.z])
      }
      if (indices) {
        for (let i = 0; i + 2 < indices.getCount(); i += 3) {
          tris.push([
            points[start + indices.getScalar(i)],
            points[start + indices.getScalar(i + 1)],
            points[start + indices.getScalar(i + 2)],
          ])
        }
      }
    }
    if (points.length) objects.push({ name: node.getName(), points, tris })
  }
  for (const child of node.listChildren()) walk(child, world)
}
for (const scene of doc.getRoot().listScenes()) {
  for (const node of scene.listChildren()) walk(node, new Matrix4())
}

// -- silhouettes to solve against ------------------------------------------- --

const idFiles = readdirSync(join(dir, 'id'))
  .filter((name) => /\.png$/i.test(name))
  .sort()
const samples = []
for (const index of [0, Math.floor(idFiles.length / 3), Math.floor((idFiles.length * 2) / 3)]) {
  const { data, info } = await sharp(join(dir, 'id', idFiles[index]))
    .resize({ width: 240, kernel: 'nearest' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const mask = new Uint8Array(info.width * info.height)
  for (let i = 0, at = 0; i < data.length; i += info.channels, at += 1) {
    mask[at] = data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8 ? 1 : 0
  }
  samples.push({ frame: index, mask, w: info.width, h: info.height })
}

// -- the cases -------------------------------------------------------------- --

const broken = (fn) => objects.map((object) => ({
  ...object,
  points: object.points.map(fn),
  tris: object.tris.map((tri) => tri.map(fn)),
}))

const zUp = ([x, y, z]) => [x, -z, y] // a Z-up scene handed to a Y-up camera
const centimetres = ([x, y, z]) => [x * 100, y * 100, z * 100]

const cases = [
  { name: 'correct delivery', objects, statedFov: camera.fovY, expect: { fov: camera.fovY, upAxis: 'y', scale: 1 } },
  { name: 'lens 14° too wide', objects, statedFov: camera.fovY + 14, expect: { fov: camera.fovY, upAxis: 'y', scale: 1 } },
  { name: 'lens 12° too long', objects, statedFov: camera.fovY - 12, expect: { fov: camera.fovY, upAxis: 'y', scale: 1 } },
  { name: 'proxy exported Z-up', objects: broken(zUp), statedFov: camera.fovY, expect: { fov: camera.fovY, upAxis: 'z', scale: 1 } },
  { name: 'proxy in centimetres', objects: broken(centimetres), statedFov: camera.fovY, expect: { fov: camera.fovY, upAxis: 'y', scale: 0.01 } },
]

let failures = 0
console.log(`\nSolving against ${samples.length} masked frames of ${dir}\n`)
for (const test of cases) {
  const started = Date.now()
  const solved = solveCamera({
    objects: test.objects,
    frames: camera.frames,
    samples,
    aspect: camera.aspect,
    initialFov: test.statedFov,
    cameraDefaults: camera,
  })
  const fovError = Math.abs(solved.fovY - test.expect.fov)
  const ok =
    fovError < 0.5 &&
    solved.fix.upAxis === test.expect.upAxis &&
    Math.abs(solved.fix.scale - test.expect.scale) < 1e-9 &&
    solved.score > 0.9
  if (!ok) failures += 1
  console.log(
    `${ok ? '  ok  ' : '  FAIL'} ${test.name.padEnd(22)} ` +
      `stated ${Number(test.statedFov).toFixed(1)}° -> solved ${solved.fovY.toFixed(2)}° ` +
      `(off by ${fovError.toFixed(2)}°) · ${solved.fix.upAxis}-up ×${solved.fix.scale} · ` +
      `overlap ${(solved.score * 100).toFixed(1)}% · ${((Date.now() - started) / 1000).toFixed(1)}s`,
  )
}

console.log(`\n${cases.length - failures}/${cases.length} passed\n`)
if (failures) process.exit(1)
