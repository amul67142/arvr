// The camera and controls are long-lived three.js objects, not React values;
// mutating them is exactly what a camera controller does.
/* oxlint-disable react/immutability */
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'

import { useViewer } from '../../state/viewerStore'
import {
  animateCameraTo,
  computeFocusPose,
  deriveClippingPlanes,
  deriveControlLimits,
  fitCameraToObject,
  fitDistanceForAspect,
} from '../../utils/cameraUtils'
import { getModelBounds } from '../../utils/modelUtils'

const INTRO_DURATION = 2.4
const FOCUS_DURATION = 1.5
const RESET_DURATION = 1.7

/** Panel widths, matching the Tailwind classes on each drawer. */
const INFO_PANEL_WIDTH = 400
const INSPECTOR_WIDTH = 368
const PANEL_BREAKPOINT = 768

/**
 * How far to slide the framing so an open drawer does not cover the subject.
 * Below the breakpoint the drawers are full-width, so sliding would not help.
 */
function lateralShiftRatio({ infoPanelOpen, inspectorOpen }) {
  const width = window.innerWidth
  if (width < PANEL_BREAKPOINT) return 0
  if (infoPanelOpen) return INFO_PANEL_WIDTH / width
  if (inspectorOpen) return -INSPECTOR_WIDTH / width
  return 0
}

/**
 * Every camera move in the app happens here. The component renders OrbitControls
 * and then drives the camera imperatively — no per-frame React state, so a
 * 1.5 second flight costs zero re-renders.
 */
export default function CameraController() {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const { model, focusRequest, selection, inspectorOpen, controlsRef } = useViewer()

  const overviewPose = useRef(null)
  const limits = useRef({ minDistance: 0.1, maxDistance: 1000, maxPolarAngle: Math.PI / 2 })
  const lastNonce = useRef(0)
  const lastAspect = useRef(null)

  // Frame the project as soon as its bounds are known, then play the intro.
  useEffect(() => {
    const controls = controlsRef.current
    if (!model || !controls) return

    const { bounds } = model
    const pose = fitCameraToObject(model.scene, camera, { bounds })
    overviewPose.current = pose
    lastAspect.current = camera.aspect

    const clipping = deriveClippingPlanes(bounds)
    camera.near = clipping.near
    camera.far = clipping.far
    camera.updateProjectionMatrix()

    limits.current = deriveControlLimits(bounds)
    Object.assign(controls, limits.current)

    // Start pulled back and slightly higher, then settle into the hero framing.
    const introStart = pose.target
      .clone()
      .add(
        pose.position
          .clone()
          .sub(pose.target)
          .multiplyScalar(1.85)
          .add(new THREE.Vector3(0, bounds.size.y * 0.55, 0)),
      )

    camera.position.copy(introStart)
    controls.target.copy(pose.target)
    controls.update()

    const timeline = animateCameraTo(camera, controls, pose, {
      duration: INTRO_DURATION,
      ease: 'power2.out',
    })

    return () => timeline?.kill()
  }, [camera, controlsRef, model])

  // Respond to focus / reset requests raised anywhere in the UI.
  useEffect(() => {
    const controls = controlsRef.current
    if (!focusRequest || !controls || !overviewPose.current) return
    if (focusRequest.nonce === lastNonce.current) return
    lastNonce.current = focusRequest.nonce

    if (!focusRequest.object) {
      Object.assign(controls, limits.current)
      animateCameraTo(camera, controls, overviewPose.current, {
        duration: RESET_DURATION,
      })
      return
    }

    const pose = computeFocusPose(focusRequest.object, camera, {
      lateralShiftRatio: lateralShiftRatio({
        // A floor focus belongs to the selected building, so the panel is open.
        infoPanelOpen:
          selection?.object === focusRequest.object ||
          selection?.floor?.object === focusRequest.object,
        inspectorOpen,
      }),
      ...(focusRequest.padding ? { padding: focusRequest.padding } : {}),
    })

    // A tight focus can sit closer than the project-wide minimum allows.
    controls.minDistance = Math.min(limits.current.minDistance, pose.distance * 0.35)
    controls.maxDistance = limits.current.maxDistance

    animateCameraTo(camera, controls, pose, { duration: FOCUS_DURATION })
    // selection / inspectorOpen only inform framing; the nonce guard above
    // keeps their changes from re-running a flight that already happened.
  }, [camera, controlsRef, focusRequest, inspectorOpen, selection])

  /**
   * Refit when the viewport aspect changes — a window resize, a tablet
   * rotation, or entering fullscreen. The fit distance is aspect-dependent, so
   * without this the project ends up cropped or stranded in the distance.
   *
   * The camera is rescaled rather than reset: the user's orbit angle and how
   * far they have zoomed in are preserved, and only the distance is corrected
   * by however much the new aspect demands.
   */
  useEffect(() => {
    const controls = controlsRef.current
    if (!model || !controls || !overviewPose.current) return

    const aspect = size.width / size.height
    const previous = lastAspect.current
    if (previous === null || Math.abs(aspect - previous) < 0.001) return
    lastAspect.current = aspect

    // Reset View must land correctly at the new aspect either way.
    overviewPose.current = fitCameraToObject(model.scene, camera, {
      bounds: model.bounds,
    })

    // Don't fight an in-flight tween; it will land at a pose computed for the
    // aspect it started with, and the user can Reset from there.
    if (gsap.isTweening(camera.position)) return

    const subject = selection ? getModelBounds(selection.object) : model.bounds
    const before = fitDistanceForAspect(subject.size, camera.fov, previous)
    const after = fitDistanceForAspect(subject.size, camera.fov, aspect)
    if (!before || !after) return

    const offset = camera.position.clone().sub(controls.target)
    camera.position.copy(controls.target).add(offset.multiplyScalar(after / before))
    controls.update()
  }, [camera, controlsRef, model, selection, size])

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.55}
      zoomSpeed={0.7}
      panSpeed={0.6}
      screenSpacePanning={false}
      maxPolarAngle={Math.PI * 0.495}
    />
  )
}
