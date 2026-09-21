import { useEffect, useMemo, useRef } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { buildLoaderExtensions } from '../../utils/loaderUtils'
import { disposeModel } from '../../utils/modelUtils'
import { prepareWalkthroughMaterials, scanWalkthrough } from '../../utils/walkthroughUtils'

/**
 * Loads a walkthrough model through the same loader setup as the 3D viewer
 * (local decoders, blob-URL companions) and reports what it found: rooms,
 * floors, solids, lights and where to start.
 */
export default function WalkthroughModel({ source, onReady }) {
  const renderer = useThree((state) => state.gl)

  const extensions = useMemo(
    () => buildLoaderExtensions(source.resources, renderer),
    [source.resources, renderer],
  )

  const gltf = useLoader(GLTFLoader, source.url, extensions)

  const walk = useMemo(() => {
    const scanned = scanWalkthrough(gltf.scene)
    prepareWalkthroughMaterials(gltf.scene)
    return scanned
  }, [gltf.scene])

  useEffect(() => {
    onReady?.(walk)
  }, [onReady, walk])

  // Same deferred disposal as the 3D viewer: StrictMode's fake unmount must
  // not clear the loader cache, or the model reloads in a loop.
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    const scene = gltf.scene
    const url = source.url

    return () => {
      mounted.current = false
      setTimeout(() => {
        if (mounted.current) return
        THREE.DefaultLoadingManager.setURLModifier(null)
        disposeModel(scene)
        useLoader.clear(GLTFLoader, url)
      }, 0)
    }
  }, [gltf.scene, source.url])

  return <primitive object={gltf.scene} />
}
