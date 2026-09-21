import * as THREE from 'three'

/**
 * Hover and selection highlighting, done without ever touching the materials
 * that came out of the GLTF file. Imported materials are routinely shared by
 * dozens of meshes, so mutating one in place would light up half the model.
 *
 * Each mesh instead gets its own lazily-cloned variants, cached on userData so
 * they can be disposed when the model is unloaded.
 */

const WHITE = new THREE.Color(0xffffff)
// Warm rather than pure white: a highlighted tower should read as lit from
// within, not as a block of white plastic.
const GLOW = new THREE.Color(0xfff0dc)
// A chosen floor has to stand out from a building that is itself already
// highlighted. On a pale facade a brighter white is invisible — hue is what
// reads, so floors take a warm brass.
const BRASS = new THREE.Color(0xe0ad62)

/**
 * Emissive is absolute and colour lift is not, so the split matters: lean on
 * emissive and a highlighted tower becomes a solid white block once the night
 * lighting drops. Most of the effect comes from the lift, which scales with
 * whatever light is actually falling on the building.
 */
const STATES = {
  hover: { emissiveIntensity: 0.03, colorLift: 0.14 },
  selected: { emissiveIntensity: 0.07, colorLift: 0.24 },
  // A single floor inside a selected building: clearly brighter than the
  // building around it, still warm rather than neon.
  floor: { emissiveIntensity: 0.42, colorLift: 0.55, tint: BRASS, glow: BRASS },
}

function makeVariant(material, { emissiveIntensity, colorLift, tint = WHITE, glow = GLOW }) {
  const variant = material.clone()

  if (variant.emissive) {
    variant.emissive = glow.clone()
    variant.emissiveIntensity = emissiveIntensity
  }

  if (variant.color) {
    variant.color = variant.color.clone().lerp(tint, colorLift)
  }

  variant.userData.__isHighlightVariant = true
  return variant
}

function variantsFor(mesh, state) {
  const cache = (mesh.userData.__highlightCache ??= {})
  if (cache[state]) return cache[state]

  const config = STATES[state]
  const source = mesh.userData.__baseMaterial ?? mesh.material

  cache[state] = Array.isArray(source)
    ? source.map((material) => makeVariant(material, config))
    : makeVariant(source, config)

  return cache[state]
}

/** Apply 'default' | 'hover' | 'selected' | 'floor' to every mesh in a subtree. */
export function applyHighlightState(root, state) {
  if (!root) return

  root.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.material) return

    mesh.userData.__baseMaterial ??= mesh.material

    if (state === 'default') {
      mesh.material = mesh.userData.__baseMaterial
      return
    }

    mesh.material = variantsFor(mesh, state)
  })
}

/** Free every cloned variant. Called when the uploaded model is discarded. */
export function disposeHighlightCache(root) {
  if (!root) return

  root.traverse((mesh) => {
    const cache = mesh.userData?.__highlightCache
    if (!cache) return

    Object.values(cache).forEach((entry) => {
      const list = Array.isArray(entry) ? entry : [entry]
      list.forEach((material) => material?.dispose?.())
    })

    if (mesh.userData.__baseMaterial) mesh.material = mesh.userData.__baseMaterial
    delete mesh.userData.__highlightCache
  })
}
