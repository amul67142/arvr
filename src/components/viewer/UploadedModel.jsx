import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

import { useModelObjects } from '../../hooks/useModelObjects'
import { useViewer } from '../../state/viewerStore'
import { applyHighlightState, disposeHighlightCache } from '../../utils/materialUtils'
import { disposeModel, findOwnerEntry } from '../../utils/modelUtils'

/**
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
function buildLoaderExtensions(resources, renderer) {
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
      return resources.get(resourceKey(url)) ?? url
    })

    const draco = new DRACOLoader(manager).setDecoderPath(DRACO_PATH)
    loader.setDRACOLoader(draco)

    const ktx2 = new KTX2Loader(manager)
      .setTranscoderPath(BASIS_PATH)
      .detectSupport(renderer)
    loader.setKTX2Loader(ktx2)

    loader.setMeshoptDecoder(MeshoptDecoder)
  }
}

export default function UploadedModel({ source }) {
  const renderer = useThree((state) => state.gl)
  const { setModel, selectTower, clearSelection, selection, hoverLabelRef } = useViewer()

  const extensions = useMemo(
    () => buildLoaderExtensions(source.resources, renderer),
    [source.resources, renderer],
  )

  const gltf = useLoader(GLTFLoader, source.url, extensions)
  const model = useModelObjects(gltf.scene)

  const hoveredRef = useRef(null)
  const selectedRef = useRef(null)
  const clearFrame = useRef(0)

  useEffect(() => {
    if (model) setModel(model)
  }, [model, setModel])

  /** Resolve the visual state of one building from hover + selection. */
  const paint = useCallback((entry) => {
    if (!entry) return
    if (entry === selectedRef.current) applyHighlightState(entry.object, 'selected')
    else if (entry === hoveredRef.current) applyHighlightState(entry.object, 'hover')
    else applyHighlightState(entry.object, 'default')
  }, [])

  const setHovered = useCallback(
    (entry) => {
      if (hoveredRef.current === entry) return

      const previous = hoveredRef.current
      hoveredRef.current = entry
      paint(previous)
      paint(entry)

      document.body.style.cursor = entry ? 'pointer' : ''

      const label = hoverLabelRef.current
      if (label) {
        label.textContent = entry?.name ?? ''
        label.dataset.visible = entry ? 'true' : 'false'
      }
    },
    [hoverLabelRef, paint],
  )

  // Selection is React state; the highlight it drives is not.
  useEffect(() => {
    if (!model) return

    const next = selection
      ? model.towers.find((entry) => entry.id === selection.id) ?? null
      : null

    const previous = selectedRef.current
    selectedRef.current = next
    paint(previous)
    paint(next)
  }, [model, paint, selection])

  const handlePointerMove = useCallback(
    (event) => {
      cancelAnimationFrame(clearFrame.current)
      setHovered(findOwnerEntry(event.object))

      const label = hoverLabelRef.current
      if (label && hoveredRef.current) {
        label.style.transform = `translate3d(${event.clientX + 16}px, ${
          event.clientY + 16
        }px, 0)`
      }
    },
    [hoverLabelRef, setHovered],
  )

  /**
   * Meshes inside one tower fire out/over against each other as the pointer
   * crosses them. Deferring the clear by a frame lets the immediately following
   * move event cancel it, which removes the flicker.
   */
  const handlePointerOut = useCallback(() => {
    cancelAnimationFrame(clearFrame.current)
    clearFrame.current = requestAnimationFrame(() => setHovered(null))
  }, [setHovered])

  const handleClick = useCallback(
    (event) => {
      const entry = findOwnerEntry(event.object)
      if (!entry) return
      event.stopPropagation()
      selectTower(entry)
    },
    [selectTower],
  )

  /**
   * Release GPU memory and the loader cache entry when this model is dropped.
   *
   * The disposal is deferred by a tick on purpose. StrictMode unmounts and
   * immediately remounts in development; clearing the loader cache during that
   * fake unmount would make useLoader re-fetch, produce a new scene, and loop
   * forever. Checking `mounted` on the next tick tells a real unmount apart
   * from a StrictMode remount.
   */
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    const scene = gltf.scene
    const url = source.url

    return () => {
      mounted.current = false
      cancelAnimationFrame(clearFrame.current)
      document.body.style.cursor = ''

      setTimeout(() => {
        if (mounted.current) return
        THREE.DefaultLoadingManager.setURLModifier(null)
        disposeHighlightCache(scene)
        disposeModel(scene)
        useLoader.clear(GLTFLoader, url)
      }, 0)
    }
  }, [gltf.scene, source.url])

  return (
    <primitive
      object={gltf.scene}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
      onPointerMissed={clearSelection}
    />
  )
}
