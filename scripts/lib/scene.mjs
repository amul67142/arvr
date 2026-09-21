/**
 * A small scene-building kit for the demo walkthrough models.
 *
 * Geometry comes from three.js (boxes, extrusions with window/door holes,
 * cylinders, lathes); materials use real CC0 textures from Poly Haven; the
 * furniture and plants are Poly Haven models merged in. Everything is written
 * as one optimised GLB: instanced repeats, simplified heavy meshes, WebP
 * textures and Meshopt-compressed geometry.
 *
 * World units are metres, Y up. Boxes take min/max corners and bake world
 * positions straight into their vertices, which keeps UVs honest: texture
 * coordinates are "metres divided by the texture's real-world tile size", so a
 * marble tile is the same physical size on every floor it covers.
 *
 * Naming contract read by the viewer's walkthrough renderer:
 *   Room_*  / Zone_*   walkable floor that names a room or zone
 *                      (node extras: { label, view: { position, yaw } })
 *   Walk_*             walkable surface with no room identity
 *   Water_*            visible, not walkable
 *   Spawn              where a visit starts (extras: { yaw })
 *   everything else    solid — you cannot walk through it
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
  dedup,
  instance,
  mergeDocuments,
  meshopt,
  prune,
  simplify,
  textureCompress,
  unpartition,
  weld,
} from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import * as THREE from 'three'

import { CACHE } from '../fetch-polyhaven.mjs'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptEncoder,
})

const DEG = Math.PI / 180

/** Quaternion [x, y, z, w] for a rotation about Y, in degrees. */
export function yaw(degrees) {
  const half = (degrees * DEG) / 2
  return [0, Math.sin(half), 0, Math.cos(half)]
}

export async function createScene(name) {
  await MeshoptSimplifier.ready
  await MeshoptEncoder.ready

  const doc = new Document()
  doc.createBuffer('main')
  const buffer = doc.getRoot().listBuffers()[0]
  const scene = doc.createScene(name)
  doc.getRoot().setDefaultScene(scene)

  const textureCache = new Map()
  const materials = new Map()
  const materialTile = new Map()
  const templates = new Map()
  const stats = { boxes: 0, meshes: 0, models: {} }

  // ---------------------------------------------------------- textures --

  function loadTexture(id, map) {
    const key = `${id}/${map}`
    if (textureCache.has(key)) return textureCache.get(key)
    let texture = null
    try {
      const image = readFileSync(join(CACHE, 'textures', id, `${map}.jpg`))
      texture = doc.createTexture(key).setImage(image).setMimeType('image/jpeg')
    } catch {
      texture = null
    }
    textureCache.set(key, texture)
    return texture
  }

  /**
   * Register a material. `texture` names a Poly Haven texture set; `tile` is
   * the real-world size in metres one repeat of it covers.
   */
  function defineMaterial(key, spec) {
    const material = doc
      .createMaterial(key)
      .setBaseColorFactor([...(spec.color ?? [1, 1, 1]), spec.opacity ?? 1])
      .setRoughnessFactor(spec.roughness ?? 0.8)
      .setMetallicFactor(spec.metallic ?? 0)

    if (spec.opacity !== undefined && spec.opacity < 1) {
      material.setAlphaMode('BLEND').setDoubleSided(true)
    }
    if (spec.doubleSided) material.setDoubleSided(true)
    if (spec.emissive) material.setEmissiveFactor(spec.emissive)

    if (spec.texture) {
      // `maps` picks which parts of a texture set to use — e.g. only its
      // normal map, for surface grain under a controlled colour.
      const use = new Set(spec.maps ?? ['diff', 'nor_gl', 'arm'])
      const diffuse = use.has('diff') ? loadTexture(spec.texture, 'diff') : null
      const normal = use.has('nor_gl') ? loadTexture(spec.texture, 'nor_gl') : null
      const arm = use.has('arm') ? loadTexture(spec.texture, 'arm') : null
      if (diffuse) material.setBaseColorTexture(diffuse)
      if (normal) material.setNormalTexture(normal).setNormalScale(spec.normalScale ?? 1)
      if (arm) {
        // Poly Haven's ARM packs AO/rough/metal exactly as glTF's ORM expects.
        material.setMetallicRoughnessTexture(arm).setOcclusionTexture(arm)
        material.setRoughnessFactor(spec.roughness ?? 1).setMetallicFactor(spec.metallic ?? 1)
      }
    }

    materials.set(key, material)
    materialTile.set(key, spec.tile ?? 1)
    return material
  }

  // ---------------------------------------------------------- geometry --

  function accessor(type, array) {
    return doc.createAccessor().setType(type).setArray(array).setBuffer(buffer)
  }

  function meshFromArrays(name, materialKey, { positions, normals, uvs, indices }) {
    const material = materials.get(materialKey)
    if (!material) throw new Error(`unknown material "${materialKey}" on ${name}`)

    const primitive = doc
      .createPrimitive()
      .setMaterial(material)
      .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
      .setAttribute('NORMAL', accessor('VEC3', new Float32Array(normals)))
      .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(uvs)))
      .setIndices(
        accessor(
          'SCALAR',
          positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
        ),
      )

    stats.meshes += 1
    return doc.createMesh(name).addPrimitive(primitive)
  }

  /** Axis-aligned box from min/max corners, UVs in material tiles. */
  function box(name, materialKey, min, max, extras) {
    const tile = materialTile.get(materialKey) ?? 1
    const [x0, y0, z0] = min
    const [x1, y1, z1] = max
    const positions = []
    const normals = []
    const uvs = []
    const indices = []

    const face = (corners, normal, uAxis, vAxis) => {
      const base = positions.length / 3
      for (const corner of corners) {
        positions.push(...corner)
        normals.push(...normal)
        uvs.push(corner[uAxis] / tile, corner[vAxis] / tile)
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }

    face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], 0, 1)
    face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], 0, 1)
    face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], 2, 1)
    face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], 2, 1)
    face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], 0, 2)
    face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], 0, 2)

    stats.boxes += 1
    const node = doc
      .createNode(name)
      .setMesh(meshFromArrays(name, materialKey, { positions, normals, uvs, indices }))
    if (extras) node.setExtras(extras)
    return node
  }

  /**
   * Bake any three.js BufferGeometry, transformed by `matrix`, into a mesh.
   * `uvScale` stretches the geometry's own UVs into material tiles.
   */
  function geometry(name, materialKey, source, matrix = new THREE.Matrix4(), options = {}) {
    const geo = source.index ? source.clone() : source.clone()
    geo.applyMatrix4(matrix)
    if (!geo.attributes.normal) geo.computeVertexNormals()
    const indexed = geo.index ? geo : geo.toNonIndexed()
    const count = indexed.attributes.position.count
    const indices = indexed.index
      ? Array.from(indexed.index.array)
      : Array.from({ length: count }, (_, i) => i)

    const [su, sv] = options.uvScale ?? [1, 1]
    const uvAttr = indexed.attributes.uv
    const uvs = uvAttr
      ? Array.from(uvAttr.array, (value, i) => value * (i % 2 === 0 ? su : sv))
      : new Array(count * 2).fill(0)

    const node = doc.createNode(name).setMesh(
      meshFromArrays(name, materialKey, {
        positions: Array.from(indexed.attributes.position.array),
        normals: Array.from(indexed.attributes.normal.array),
        uvs,
        indices,
      }),
    )
    if (options.extras) node.setExtras(options.extras)
    return node
  }

  /**
   * A wall panel in the X/Y plane with rectangular openings, extruded to its
   * thickness. `openings` are { x, y, w, h } in the wall's own 2D space.
   * Placed by `matrix` (usually a translation plus a Y rotation).
   */
  function wall(name, materialKey, { length, height, thickness, openings = [] }, matrix) {
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.lineTo(length, 0)
    shape.lineTo(length, height)
    shape.lineTo(0, height)
    shape.lineTo(0, 0)

    for (const { x, y, w, h } of openings) {
      const hole = new THREE.Path()
      hole.moveTo(x, y)
      hole.lineTo(x, y + h)
      hole.lineTo(x + w, y + h)
      hole.lineTo(x + w, y)
      hole.lineTo(x, y)
      shape.holes.push(hole)
    }

    const extruded = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false })
    extruded.translate(0, 0, -thickness / 2)
    const tile = materialTile.get(materialKey) ?? 1
    return geometry(name, materialKey, extruded, matrix, { uvScale: [1 / tile, 1 / tile] })
  }

  /**
   * A flat slab in the XZ plane with rectangular or circular holes — a lawn
   * around a pool, a deck with the pool cut out. Top surface at `y`.
   * Rects are [x0, z0, x1, z1]; circles are { x, z, r }.
   */
  function slab(name, materialKey, { outer, holes = [], circles = [], y = 0, thickness = 0.1 }, extras) {
    // Shape lives in (x, -z) so that rotating it flat lands it in world XZ.
    const rectPath = (path, [x0, z0, x1, z1], reverse = false) => {
      const points = [
        [x0, -z0],
        [x1, -z0],
        [x1, -z1],
        [x0, -z1],
      ]
      if (reverse) points.reverse()
      path.moveTo(...points[0])
      for (const point of points.slice(1)) path.lineTo(...point)
      path.lineTo(...points[0])
    }

    const shape = new THREE.Shape()
    rectPath(shape, outer)
    for (const hole of holes) {
      const path = new THREE.Path()
      rectPath(path, hole, true)
      shape.holes.push(path)
    }
    for (const { x, z, r } of circles) {
      const path = new THREE.Path()
      path.absarc(x, -z, r, 0, Math.PI * 2, true)
      shape.holes.push(path)
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 32 })
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, y - thickness, 0)
    const tile = materialTile.get(materialKey) ?? 1
    return geometry(name, materialKey, geo, new THREE.Matrix4(), {
      uvScale: [1 / tile, 1 / tile],
      extras,
    })
  }

  /**
   * A reusable object built once at the origin and placed many times. Every
   * placement shares the same meshes, so `instance()` batches them into GPU
   * instancing on write — thirty trees cost one draw call.
   */
  function prefab(name, build) {
    const parts = build()
    let count = 0
    return (position = [0, 0, 0], rotation = 0, scale = 1) => {
      count += 1
      const holder = group(`${name}_${count}`, parts.map(cloneTree), position, yaw(rotation))
      holder.setScale(typeof scale === 'number' ? [scale, scale, scale] : scale)
      return holder
    }
  }

  function group(name, children = [], translation = [0, 0, 0], rotation = [0, 0, 0, 1]) {
    const node = doc.createNode(name).setTranslation(translation).setRotation(rotation)
    for (const child of children) if (child) node.addChild(child)
    return node
  }

  function empty(name, position, extras) {
    const node = doc.createNode(name).setTranslation(position)
    if (extras) node.setExtras(extras)
    return node
  }

  // ------------------------------------------------------------ models --

  function cloneTree(node) {
    const copy = doc
      .createNode(node.getName())
      .setTranslation(node.getTranslation())
      .setRotation(node.getRotation())
      .setScale(node.getScale())
    const mesh = node.getMesh()
    if (mesh) copy.setMesh(mesh)
    for (const child of node.listChildren()) copy.addChild(cloneTree(child))
    return copy
  }

  /**
   * Place a Poly Haven model. The first placement merges it into the document
   * (after optional simplification); later placements reuse the same meshes,
   * which `instance()` then turns into GPU instancing on write.
   */
  async function model(id, { position = [0, 0, 0], rotation = 0, scale = 1, simplifyRatio = 1 } = {}) {
    let roots = templates.get(id)

    if (!roots) {
      const path = join(CACHE, 'models', id, `${id}.gltf`)
      const source = await io.read(path)
      if (simplifyRatio < 1) {
        await source.transform(
          weld(),
          simplify({ simplifier: MeshoptSimplifier, ratio: simplifyRatio, error: 0.02 }),
        )
      }
      const sourceScene = source.getRoot().getDefaultScene() ?? source.getRoot().listScenes()[0]
      const map = mergeDocuments(doc, source)
      const merged = map.get(sourceScene)
      roots = merged.listChildren()
      for (const root of roots) merged.removeChild(root)
      merged.dispose()
      templates.set(id, roots)
      stats.models[id] = 0

      const holder = group(`${id}_1`, roots, position, yaw(rotation))
      holder.setScale([scale, scale, scale])
      stats.models[id] += 1
      return holder
    }

    stats.models[id] += 1
    const holder = group(
      `${id}_${stats.models[id]}`,
      roots.map(cloneTree),
      position,
      yaw(rotation),
    )
    holder.setScale([scale, scale, scale])
    return holder
  }

  // ------------------------------------------------------------- write --

  function add(...nodes) {
    for (const node of nodes) if (node) scene.addChild(node)
  }

  async function write(outPath, { textureSize = 1024 } = {}) {
    await doc.transform(
      dedup(),
      instance({ min: 2 }),
      prune({ keepExtras: true }),
      textureCompress({
        encoder: sharp,
        targetFormat: 'webp',
        resize: [textureSize, textureSize],
        quality: 82,
      }),
      unpartition(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    )

    const out = resolve(outPath)
    await io.write(out, doc)
    return { out, stats }
  }

  return {
    doc,
    materials: { define: defineMaterial },
    box,
    geometry,
    wall,
    slab,
    prefab,
    group,
    empty,
    model,
    add,
    write,
    stats,
    THREE,
  }
}
