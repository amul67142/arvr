import * as THREE from 'three'

/**
 * Reads a walkthrough model by its naming contract. Any GLB following these
 * names works — this is not tied to the bundled demo unit.
 *
 *   Room_* / Zone_*   walkable floor naming a room or outdoor zone. Node extras
 *                     (GLTF → userData) may carry { label, order, area,
 *                     view: { x, z, yaw } }
 *   Walk_*            walkable surface with no room identity (paths, steps)
 *   Water_*           visible but neither walkable nor solid
 *   Spawn             where a visit starts; userData.yaw in degrees
 *   Light_*           a night-time light; userData { intensity, color, distance }
 *   Ceiling_*, Ground_Far, Rug_*   visual only — never block movement
 *   anything else     solid: walls, glass, furniture
 *
 * Yaw follows three.js: 0 looks down -Z, positive turns toward -X.
 */

const WALKABLE = /^(Room_|Zone_|Walk_)/
const ROOM = /^(Room_|Zone_)/
const PASSIVE = /^(Water_|Ceiling_|Ground_Far|Rug_|Light_|Spawn)/

const DEG = Math.PI / 180

function prettyLabel(name) {
  return name
    .replace(ROOM, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/** Name of the nearest ancestor that matches, so grouped floors still count. */
function taggedAncestor(object, pattern) {
  for (let node = object; node; node = node.parent) {
    if (pattern.test(node.name ?? '')) return node
  }
  return null
}

export function scanWalkthrough(root) {
  root.updateMatrixWorld(true)

  const rooms = []
  const walkables = []
  const colliders = []
  const lights = []
  let spawn = null

  const roomByNode = new Map()
  const bounds = new THREE.Box3()

  root.traverse((object) => {
    const name = object.name ?? ''

    if (name === 'Spawn') {
      spawn = {
        position: object.getWorldPosition(new THREE.Vector3()),
        yaw: (object.userData?.yaw ?? 0) * DEG,
      }
      return
    }

    if (/^Light_/.test(name)) {
      lights.push({
        position: object.getWorldPosition(new THREE.Vector3()),
        intensity: object.userData?.intensity ?? 14,
        color: object.userData?.color ?? '#ffd9a8',
        distance: object.userData?.distance ?? 9,
      })
      return
    }

    if (!object.isMesh) return

    const walkNode = taggedAncestor(object, WALKABLE)
    if (walkNode) {
      walkables.push(object)
      object.userData.__walkable = true

      const roomNode = taggedAncestor(object, ROOM)
      if (roomNode && !roomByNode.has(roomNode)) {
        const box = new THREE.Box3().setFromObject(roomNode)
        const data = roomNode.userData ?? {}
        const room = {
          id: roomNode.name,
          label: data.label ?? prettyLabel(roomNode.name),
          order: data.order ?? rooms.length,
          area: data.area ?? null,
          floorY: box.max.y,
          bounds: { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z },
          view: data.view
            ? { x: data.view.x, z: data.view.z, yaw: (data.view.yaw ?? 0) * DEG }
            : null,
          outdoor: roomNode.name.startsWith('Zone_'),
        }
        roomByNode.set(roomNode, room)
        rooms.push(room)
        bounds.union(box)
      }
      if (roomNode) object.userData.__room = roomByNode.get(roomNode)
      return
    }

    if (taggedAncestor(object, PASSIVE)) return
    colliders.push(object)
  })

  rooms.sort((a, b) => a.order - b.order)

  // A room without an authored viewpoint gets one: a corner, looking across.
  for (const room of rooms) {
    if (room.view) continue
    const { minX, maxX, minZ, maxZ } = room.bounds
    const x = minX + (maxX - minX) * 0.85
    const z = minZ + (maxZ - minZ) * 0.85
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    room.view = { x, z, yaw: Math.atan2(-(cx - x), -(cz - z)) }
  }

  if (!spawn && rooms[0]) {
    const first = rooms[0]
    spawn = {
      position: new THREE.Vector3(first.view.x, first.floorY, first.view.z),
      yaw: first.view.yaw,
    }
  }

  // Night lights fall back to one per room, just under the ceiling.
  if (lights.length === 0) {
    for (const room of rooms) {
      const { minX, maxX, minZ, maxZ } = room.bounds
      lights.push({
        position: new THREE.Vector3((minX + maxX) / 2, room.floorY + 2.5, (minZ + maxZ) / 2),
        intensity: 12,
        color: '#ffd9a8',
        distance: 9,
      })
    }
  }

  return {
    rooms,
    walkables,
    colliders,
    lights,
    spawn,
    bounds: bounds.isEmpty() ? new THREE.Box3().setFromObject(root) : bounds,
  }
}

/** Configure shadows once: glass and water must not cast them. */
export function prepareWalkthroughMaterials(root) {
  root.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const transparent = materials.some((material) => material?.transparent)
    object.castShadow = !transparent && !object.userData.__walkable
    object.receiveShadow = true
  })
}
