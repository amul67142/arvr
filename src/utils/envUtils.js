import * as THREE from 'three'

/**
 * Lighting is built locally rather than pulled from a CDN HDRI. Drei's
 * <Environment preset> needs a multi-megabyte download that can stall or fail,
 * which is not acceptable when this is being demoed in front of a client.
 *
 * A gradient sky plus a few emissive light cards, baked through PMREM, gives
 * clean architectural reflections at a fraction of the cost.
 */

export const TIME_OF_DAY = {
  day: {
    key: 'day',
    skyTop: '#b9cadb',
    skyBottom: '#e6e1d8',
    groundColor: '#a8a296',
    sunColor: '#fff4e2',
    sunIntensity: 2.1,
    ambientColor: '#b8c6d6',
    ambientIntensity: 0.18,
    hemiSky: '#cfdced',
    hemiGround: '#9c948a',
    hemiIntensity: 0.32,
    envIntensity: 0.72,
    sunElevation: 0.58,
    sunAzimuth: 0.9,
    pageTop: '#c4d2df',
    pageBottom: '#eae5dc',
    shadowOpacity: 0.42,
  },
  night: {
    key: 'night',
    skyTop: '#05070d',
    skyBottom: '#141a26',
    groundColor: '#0b0d12',
    sunColor: '#a8bfe0',
    sunIntensity: 0.65,
    ambientColor: '#46618a',
    ambientIntensity: 0.26,
    hemiSky: '#2a3b55',
    hemiGround: '#101318',
    hemiIntensity: 0.55,
    envIntensity: 0.55,
    sunElevation: 0.45,
    sunAzimuth: -1.8,
    pageTop: '#04060b',
    pageBottom: '#101623',
    shadowOpacity: 0.55,
  },
}

function gradientTexture(topHex, bottomHex) {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 256

  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 0, 256)
  gradient.addColorStop(0, topHex)
  gradient.addColorStop(0.52, bottomHex)
  gradient.addColorStop(1, bottomHex)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 4, 256)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

/** Build the tiny scene that PMREM bakes into an environment map. */
function buildEnvScene(preset) {
  const scene = new THREE.Scene()

  const skyTexture = gradientTexture(preset.skyTop, preset.skyBottom)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide }),
  )
  scene.add(sky)

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(preset.groundColor) }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -6
  scene.add(ground)

  // Key light card, roughly where the sun sits.
  const key = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 28),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(preset.sunColor).multiplyScalar(
        preset.key === 'day' ? 1.9 : 0.6,
      ),
    }),
  )
  key.position.set(
    Math.cos(preset.sunAzimuth) * 26,
    22 * preset.sunElevation + 8,
    Math.sin(preset.sunAzimuth) * 26,
  )
  key.lookAt(0, 0, 0)
  scene.add(key)

  // Cool fill from the opposite side keeps facades from going flat.
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 20),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(preset.hemiSky).multiplyScalar(
        preset.key === 'day' ? 0.75 : 0.35,
      ),
    }),
  )
  fill.position.set(-Math.cos(preset.sunAzimuth) * 28, 14, -Math.sin(preset.sunAzimuth) * 28)
  fill.lookAt(0, 0, 0)
  scene.add(fill)

  return { scene, dispose: () => disposeEnvScene(scene) }
}

function disposeEnvScene(scene) {
  scene.traverse((object) => {
    if (!object.isMesh) return
    object.geometry.dispose()
    object.material.map?.dispose()
    object.material.dispose()
  })
}

/** Bake both presets once; swapping between them is then a texture assignment. */
export function bakeEnvironments(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()

  const targets = {}

  Object.values(TIME_OF_DAY).forEach((preset) => {
    const { scene, dispose } = buildEnvScene(preset)
    targets[preset.key] = pmrem.fromScene(scene, 0.035)
    dispose()
  })

  return {
    textures: {
      day: targets.day.texture,
      night: targets.night.texture,
    },
    dispose: () => {
      Object.values(targets).forEach((target) => target.dispose())
      pmrem.dispose()
    },
  }
}

/** Page background gradient, driven from the same palette as the 3D lighting. */
export function applyPageGradient(topHex, bottomHex) {
  const root = document.documentElement
  root.style.setProperty('--sky-top', topHex)
  root.style.setProperty('--sky-bottom', bottomHex)
}
