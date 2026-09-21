import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { useModelObjects } from '../../hooks/useModelObjects'
import { useViewer } from '../../state/viewerStore'
import { buildLoaderExtensions } from '../../utils/loaderUtils'
import { applyHighlightState, disposeHighlightCache } from '../../utils/materialUtils'
import { disposeModel, findFloorEntry, findOwnerEntry } from '../../utils/modelUtils'

const prettyName = (name) => name.replace(/_/g, ' ')

export default function UploadedModel({ source }) {
  const renderer = useThree((state) => state.gl)
  const {
    setModel,
    selectTower,
    selectFloor,
    clearSelection,
    selection,
    hoverLabelRef,
    floorPreviewRef,
  } = useViewer()

  const extensions = useMemo(
    () => buildLoaderExtensions(source.resources, renderer),
    [source.resources, renderer],
  )

  const gltf = useLoader(GLTFLoader, source.url, extensions)
  const model = useModelObjects(gltf.scene)

  const hoveredRef = useRef(null)
  const selectedRef = useRef(null)
  // Floors only light up inside the selected building: the one under the
  // pointer, else the one hovered in the panel, else the one selected.
  const hoveredFloorRef = useRef(null)
  const previewFloorRef = useRef(null)
  const selectedFloorRef = useRef(null)
  const clearFrame = useRef(0)

  useEffect(() => {
    if (model) setModel(model)
  }, [model, setModel])

  /** Resolve the visual state of one building (and its active floor). */
  const paint = useCallback((entry) => {
    if (!entry) return
    const isSelected = entry === selectedRef.current
    if (isSelected) applyHighlightState(entry.object, 'selected')
    else if (entry === hoveredRef.current) applyHighlightState(entry.object, 'hover')
    else applyHighlightState(entry.object, 'default')

    if (isSelected) {
      const floor = hoveredFloorRef.current ?? previewFloorRef.current ?? selectedFloorRef.current
      if (floor) applyHighlightState(floor.object, 'floor')
    }
  }, [])

  const setHovered = useCallback(
    (entry, floor = null) => {
      if (hoveredRef.current === entry && hoveredFloorRef.current === floor) return

      const previous = hoveredRef.current
      hoveredRef.current = entry
      hoveredFloorRef.current = floor
      paint(previous)
      paint(entry)

      document.body.style.cursor = entry ? 'pointer' : ''

      const label = hoverLabelRef.current
      if (label) {
        label.textContent = !entry
          ? ''
          : floor
            ? `${prettyName(entry.name)} · Floor ${floor.number}`
            : entry.name
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
    const nextFloor =
      next && selection?.floor
        ? next.floors?.find((floor) => floor.id === selection.floor.id) ?? null
        : null

    const previous = selectedRef.current
    selectedRef.current = next
    selectedFloorRef.current = nextFloor
    if (previous !== next) previewFloorRef.current = null
    paint(previous)
    paint(next)
  }, [model, paint, selection])

  // Let the panel preview a floor by hovering its number.
  useEffect(() => {
    if (!floorPreviewRef) return
    floorPreviewRef.current = (floorId) => {
      const tower = selectedRef.current
      const floor = floorId ? tower?.floors?.find((candidate) => candidate.id === floorId) ?? null : null
      if (previewFloorRef.current === floor) return
      previewFloorRef.current = floor
      paint(tower)
    }
    return () => {
      floorPreviewRef.current = null
    }
  }, [floorPreviewRef, paint])

  const handlePointerMove = useCallback(
    (event) => {
      // R3F delivers the move to every intersected mesh, nearest first. Without
      // this the last — farthest — call wins, so where two towers overlap on
      // screen the hover lit the one behind while a click (which already stops
      // propagation) picked the one in front.
      event.stopPropagation()
      cancelAnimationFrame(clearFrame.current)

      const entry = findOwnerEntry(event.object)
      // Inside the selected building, the pointer is choosing a floor.
      const floor = entry && entry === selectedRef.current ? findFloorEntry(event.object) : null
      setHovered(entry, floor)

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

      // A second click on the selected building picks the floor under it.
      if (entry === selectedRef.current) {
        const floor = findFloorEntry(event.object)
        if (floor) {
          selectFloor(entry, floor)
          return
        }
      }
      selectTower(entry)
    },
    [selectFloor, selectTower],
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
