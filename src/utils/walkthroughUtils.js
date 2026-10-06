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

const GRID = 7
const PROBE_HEIGHT = 1.5 // above beds and sofas, so those don't hide a clear view
const DIRECTIONS = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2)

/**
 * Samples a grid over the room, keeps points that stand on its floor, and
 * picks the one farthest from any wall or furniture. Faces the direction with
 * the longest clear sightline, so the first view takes the room in.
 */
function findOpenView(room, walkables, colliders) {
  const { minX, maxX, minZ, maxZ } = room.bounds
  const ray = new THREE.Raycaster()
  const origin = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const down = new THREE.Vector3(0, -1, 0)
  let best = null

  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const x = minX + ((i + 0.5) / GRID) * (maxX - minX)
      const z = minZ + ((j + 0.5) / GRID) * (maxZ - minZ)

      // Must be on this room's floor with nothing standing on it. The probe starts
      // above the room: a ray born inside a wardrobe would not see its faces.
      origin.set(x, room.floorY + 4, z)
      ray.set(origin, down)
      ray.far = 5
      const floorHit = ray.intersectObjects(walkables, false)[0]
      if (!floorHit || floorHit.object.userData.__room !== room) continue
      const blocked = ray.intersectObjects(colliders, false)[0]
      if (blocked && blocked.distance < floorHit.distance) continue

      origin.set(x, room.floorY + PROBE_HEIGHT, z)
      let nearest = Infinity
      let longest = { distance: -1, angle: 0 }
      for (const angle of DIRECTIONS) {
        dir.set(-Math.sin(angle), 0, -Math.cos(angle))
        ray.set(origin, dir)
        ray.far = 20
        const hit = ray.intersectObjects(colliders, false)[0]
        const distance = hit ? hit.distance : 20
        nearest = Math.min(nearest, distance)
        if (distance > longest.distance) longest = { distance, angle }
      }
      if (!best || nearest > best.nearest) best = { x, z, yaw: longest.angle, nearest }
    }
  }

  if (best) return { x: best.x, z: best.z, yaw: best.yaw }
  // Nothing sampled cleanly: the middle of the room, looking along it.
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, yaw: 0 }
}

/**
 * Finds floor meshes by shape: flat (under 30 cm thick), bigger than a rug
 * sample and smaller than a site ground plane, with tops near the lowest such
 * surface. They become one walkable room; ground planes stop blocking.
 */
function autoFloor(colliders, walkables, rooms, bounds) {
  const boxes = colliders.map((object) => ({ object, box: new THREE.Box3().setFromObject(object) }))
  const flat = boxes.filter(({ box }) => {
    const size = box.getSize(new THREE.Vector3())
    return size.y < 0.3 && size.x * size.z > 1.5
  })
  const ground = new Set(flat.filter(({ box }) => {
    const size = box.getSize(new THREE.Vector3())
    return size.x * size.z > 300
  }).map(({ object }) => object))
  const floors = flat.filter(({ object }) => !ground.has(object))
  if (floors.length === 0) return

  const lowest = Math.min(...floors.map(({ box }) => box.max.y))
  const chosen = floors.filter(({ box }) => box.max.y < lowest + 0.35)
  const area = new THREE.Box3()
  for (const { box } of chosen) area.union(box)

  const room = {
    id: 'Interior',
    label: 'Interior',
    order: 0,
    area: null,
    floorY: area.max.y,
    bounds: { minX: area.min.x, maxX: area.max.x, minZ: area.min.z, maxZ: area.max.z },
    view: null,
    outdoor: false,
  }
  rooms.push(room)
  bounds.union(area)

  const moved = new Set([...chosen.map(({ object }) => object), ...ground])
  for (const { object } of chosen) {
    object.userData.__walkable = true
    object.userData.__room = room
    walkables.push(object)
  }
  for (let i = colliders.length - 1; i >= 0; i--) {
    if (moved.has(colliders[i])) colliders.splice(i, 1)
  }
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

  // A model that follows none of the naming (a raw CAD or 3ds Max export)
  // still gets a walk: its lowest large flat surfaces become the floor.
  if (walkables.length === 0) autoFloor(colliders, walkables, rooms, bounds)

  rooms.sort((a, b) => a.order - b.order)

  // A room without an authored viewpoint gets the most open spot on its
  // floor, looking the longest way across — never inside a wardrobe.
  for (const room of rooms) {
    if (!room.view) room.view = findOpenView(room, walkables, colliders)
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
