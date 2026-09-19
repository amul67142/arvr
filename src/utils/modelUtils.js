import * as THREE from 'three'

/**
 * Name prefixes that mark an object as a selectable building in Phase 1.
 * Phase 2 (floors) and Phase 3 (units) will add their own prefix tables here,
 * which is why detection is written as a generic prefix matcher rather than a
 * hard-coded "tower" check.
 */
export const SELECTABLE_PREFIXES = ['tower_', 'building_', 'block_']

const NOOP_RAYCAST = () => {}
const MAX_TREE_NODES = 6000

export function isSelectableName(name) {
  if (!name) return false
  const lower = name.toLowerCase()
  return SELECTABLE_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

/** Bounding box, centre, size and radius of any Object3D subtree. */
export function getModelBounds(object) {
  const box = new THREE.Box3().setFromObject(object)

  if (box.isEmpty()) {
    return {
      box,
      center: new THREE.Vector3(),
      size: new THREE.Vector3(1, 1, 1),
      maxDim: 1,
      radius: 1,
      isEmpty: true,
    }
  }

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const sphere = box.getBoundingSphere(new THREE.Sphere())

  return {
    box,
    center,
    size,
    maxDim,
    radius: sphere.radius || maxDim / 2,
    isEmpty: false,
  }
}

/**
 * Walk the scene and collect every object whose name marks it as a building.
 * A matching object swallows its subtree, so `Tower_A` never competes with a
 * nested `Tower_A_Core` for the same click.
 */
export function detectSelectableObjects(root) {
  const found = []
  const claimed = new Set()

  root.traverse((child) => {
    if (!isSelectableName(child.name)) return

    for (let parent = child.parent; parent; parent = parent.parent) {
      if (claimed.has(parent)) return
    }

    claimed.add(child)
    found.push({ id: child.uuid, name: child.name, object: child })
  })

  found.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  return found
}

/**
 * Raycasting every mesh of a 200k-triangle masterplan on each pointer move is
 * the single biggest cost in a viewer like this. Only the detected buildings
 * need to be hit-testable, so everything else opts out. The original raycast
 * is kept on userData so a later phase can re-enable floors and units.
 */
export function setInteractiveSubtree(root, selectables) {
  root.traverse((object) => {
    if (!object.isMesh) return
    if (!object.userData.__originalRaycast) {
      object.userData.__originalRaycast = object.raycast
    }
    object.raycast = NOOP_RAYCAST
    object.userData.__owner = null
  })

  selectables.forEach((entry) => {
    entry.object.traverse((object) => {
      if (!object.isMesh) return
      if (object.userData.__originalRaycast) {
        object.raycast = object.userData.__originalRaycast
      }
      object.userData.__owner = entry
    })
  })
}

/** Resolve a raycast hit back to the building entry that owns it. */
export function findOwnerEntry(object) {
  for (let node = object; node; node = node.parent) {
    if (node.userData?.__owner) return node.userData.__owner
  }
  return null
}

/**
 * Shadow work scales with mesh count, so large scenes opt out rather than
 * stuttering. Returns whether shadows were enabled.
 */
export function configureShadows(root, meshCount, limit = 2500) {
  const enabled = meshCount <= limit

  root.traverse((object) => {
    if (!object.isMesh) return
    object.castShadow = enabled
    object.receiveShadow = enabled
    if (object.material) object.frustumCulled = true
  })

  return enabled
}

function labelFor(object) {
  if (object.name) return object.name
  return `(unnamed ${object.type})`
}

/** Nested tree for the Model Inspector, capped so pathological files stay usable. */
export function buildHierarchy(root) {
  let budget = MAX_TREE_NODES
  let truncated = false

  const walk = (object, depth) => {
    if (budget <= 0) {
      truncated = true
      return null
    }
    budget -= 1

    const children = []
    for (const child of object.children) {
      const node = walk(child, depth + 1)
      if (node) children.push(node)
    }

    return {
      id: object.uuid,
      name: labelFor(object),
      searchName: (object.name || object.type).toLowerCase(),
      type: object.type,
      isMesh: Boolean(object.isMesh),
      isSelectable: isSelectableName(object.name),
      depth,
      object,
      children,
    }
  }

  const tree = walk(root, 0)
  return { tree, truncated }
}

/** Flatten a hierarchy to the nodes matching a query, plus their ancestors. */
export function filterHierarchy(node, query) {
  if (!query) return node

  const matches = node.searchName.includes(query)
  const children = node.children
    .map((child) => filterHierarchy(child, query))
    .filter(Boolean)

  if (!matches && children.length === 0) return null
  return { ...node, children, isMatch: matches }
}

export function getSceneStats(root) {
  let objects = 0
  let meshes = 0
  let triangles = 0
  const materials = new Set()
  const textures = new Set()

  root.traverse((object) => {
    objects += 1
    if (!object.isMesh) return
    meshes += 1

    const geometry = object.geometry
    if (geometry) {
      const index = geometry.index
      const position = geometry.attributes?.position
      if (index) triangles += index.count / 3
      else if (position) triangles += position.count / 3
    }

    const list = Array.isArray(object.material) ? object.material : [object.material]
    list.forEach((material) => {
      if (!material) return
      materials.add(material.uuid)
      Object.values(material).forEach((value) => {
        if (value && value.isTexture) textures.add(value.uuid)
      })
    })
  })

  return {
    objects,
    meshes,
    triangles: Math.round(triangles),
    materials: materials.size,
    textures: textures.size,
  }
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`
  return `${mb.toFixed(1)} MB`
}

export function formatCount(value) {
  return new Intl.NumberFormat('en-US').format(value)
}

/** Nicely formatted model dimensions, unit-agnostic (GLTF is metres by spec). */
export function formatDimensions(size) {
  const fmt = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1))
  return {
    width: `${fmt(size.x)} m`,
    height: `${fmt(size.y)} m`,
    depth: `${fmt(size.z)} m`,
  }
}

/** Release every GPU resource the uploaded model holds. */
export function disposeModel(root) {
  if (!root) return

  root.traverse((object) => {
    if (!object.isMesh) return
    object.geometry?.dispose?.()

    const list = Array.isArray(object.material) ? object.material : [object.material]
    list.forEach((material) => {
      if (!material) return
      Object.values(material).forEach((value) => {
        if (value && value.isTexture) value.dispose()
      })
      material.dispose()
    })
  })
}
