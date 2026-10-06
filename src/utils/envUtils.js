import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

/** A real daytime sky, bundled with the app (Poly Haven, CC0, 1.4 MB). */
export const DAY_SKY_URL = '/env/sky-day.hdr'

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
    sunColor: '#fff3df',
    sunIntensity: 2.9, // a clear-day sun: lit faces bright, shaded faces cool
    ambientColor: '#b8c6d6',
    ambientIntensity: 0.08,
    hemiSky: '#bcd3ee',
    hemiGround: '#a39a8c',
    hemiIntensity: 0.22,
    envIntensity: 0.85,
    sunElevation: 0.58,
    sunAzimuth: 0.9,
    pageTop: '#8fb3d9',
    pageBottom: '#e3e8ee',
    shadowOpacity: 0.48,
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

/**
 * Load the bundled sky HDRI and prefilter it for reflections. It replaces the
 * baked day gradient once ready: glass then mirrors real sky and cloud. It is
 * served by the app itself, so there is no CDN to stall; if it fails anyway,
 * the gradient simply stays.
 */
export function loadSkyEnvironment(renderer, url = DAY_SKY_URL) {
  return new HDRLoader().loadAsync(url).then((hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping
    const pmrem = new THREE.PMREMGenerator(renderer)
    const target = pmrem.fromEquirectangular(hdr)
    hdr.dispose()
    pmrem.dispose()
    return { texture: target.texture, dispose: () => target.dispose() }
  })
}
