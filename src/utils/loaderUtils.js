import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

/**
 * Loader configuration shared by every renderer that reads a GLTF: the 3D
 * masterplan viewer and the walkthrough.
 *
 * Decoders are served from /public rather than a CDN — real estate demos happen
 * on conference wifi, and a failed decoder fetch would mean a blank screen.
 */
const DRACO_PATH = '/draco/'
const BASIS_PATH = '/basis/'

/**
 * Filename of a URL, lowercased. Companion files are keyed by basename because
 * a .gltf may reference them as "scene.bin" or "textures/wall.jpg" while the
 * user dropped a flat selection of files.
 */
function resourceKey(url) {
  const withoutQuery = url.split('?')[0].split('#')[0]
  return decodeURIComponent(withoutQuery.split('/').pop() ?? '').toLowerCase()
}

/**
 * Configure a GLTFLoader for a locally-uploaded file.
 *
 * The URL modifier is what makes multi-file .gltf work: the .gltf's relative
 * references ("scene.bin", "textures/wall.jpg") are rewritten to the blob URLs
 * created for the companion files the user dropped alongside it.
 */
export function buildLoaderExtensions(resources, renderer) {
  return (loader) => {
    // Deliberately the default manager rather than a private one: drei's
    // useProgress listens to it, and that is what drives the loading screen.
    const manager = THREE.DefaultLoadingManager

    manager.setURLModifier((url) => {
      // Embedded resources are already self-contained.
      if (url.startsWith('data:')) return url

      // Relative references are resolved against the .gltf's own blob URL
      // first, so by the time they arrive here they look like
      // "blob:http://host/scene.bin". Matching on the filename is what maps
      // them back to the companion the user supplied. The model's own blob URL
      // ends in a UUID, which is never a key, so it passes through untouched.
      return resources?.get(resourceKey(url)) ?? url
    })

    const draco = new DRACOLoader(manager).setDecoderPath(DRACO_PATH)
    loader.setDRACOLoader(draco)

    const ktx2 = new KTX2Loader(manager).setTranscoderPath(BASIS_PATH).detectSupport(renderer)
    loader.setKTX2Loader(ktx2)

    loader.setMeshoptDecoder(MeshoptDecoder)
  }
}
