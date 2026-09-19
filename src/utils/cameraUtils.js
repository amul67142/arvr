import * as THREE from 'three'
import gsap from 'gsap'

import { getModelBounds } from './modelUtils'

/** Elevated three-quarter angle — the standard masterplan hero framing. */
const OVERVIEW_DIRECTION = new THREE.Vector3(0.72, 0.52, 1).normalize()

const MIN_FOCUS_ELEVATION = 0.22
const MAX_FOCUS_ELEVATION = 0.55

/**
 * Distance at which an object of `size` fills the frame, accounting for both
 * the vertical and the horizontal field of view. Never hard-code a distance:
 * uploaded models arrive at wildly different scales.
 */
export function fitDistanceForAspect(size, fov, aspect, padding = 1.4) {
  const vFov = (fov * Math.PI) / 180
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (aspect || 16 / 9))

  const spanY = Math.max(size.y, 0.001)
  // The widest face, not the diagonal: using the diagonal pushes the camera
  // far enough back that a masterplan reads as a postage stamp.
  const spanXZ = Math.max(size.x, size.z, 0.001)

  const distanceForHeight = spanY / 2 / Math.tan(vFov / 2)
  const distanceForWidth = spanXZ / 2 / Math.tan(hFov / 2)

  return Math.max(distanceForHeight, distanceForWidth) * padding
}

export function computeFitDistance(size, camera, padding = 1.4) {
  return fitDistanceForAspect(size, camera.fov, camera.aspect, padding)
}

/** Camera pose that frames the whole project. Stored once and reused by Reset View. */
export function fitCameraToObject(object, camera, options = {}) {
  const { padding = 1.38, bounds = null } = options
  const modelBounds = bounds ?? getModelBounds(object)
  const distance = computeFitDistance(modelBounds.size, camera, padding)

  const target = modelBounds.center.clone()
  const position = target
    .clone()
    .add(OVERVIEW_DIRECTION.clone().multiplyScalar(distance))

  return { position, target, distance, bounds: modelBounds }
}

/**
 * Camera pose for a single building. The approach direction is inherited from
 * wherever the user is currently orbiting, with the elevation clamped into a
 * flattering band, so the flight feels like a continuation of their own move
 * rather than a jump cut.
 */
export function computeFocusPose(object, camera, options = {}) {
  // Tight: a tower should fill the frame when it is the subject. Generous
  // padding reads as "nothing happened" when the building is nearly as tall as
  // the whole site.
  const { padding = 1.22, lateralShiftRatio = 0 } = options
  const bounds = getModelBounds(object)

  const direction = camera.position.clone().sub(bounds.center)
  if (direction.lengthSq() < 1e-6) direction.copy(OVERVIEW_DIRECTION)
  direction.normalize()

  const horizontal = Math.hypot(direction.x, direction.z) || 1
  const elevation = THREE.MathUtils.clamp(
    direction.y,
    MIN_FOCUS_ELEVATION,
    MAX_FOCUS_ELEVATION,
  )
  direction.set(
    (direction.x / horizontal) * Math.sqrt(1 - elevation * elevation),
    elevation,
    (direction.z / horizontal) * Math.sqrt(1 - elevation * elevation),
  )

  // An open drawer narrows the usable frame, so fit against an effective
  // aspect ratio rather than scaling the distance. Scaling would also push a
  // height-constrained subject back, and a side panel never crops height — for
  // a slender tower that is the difference between a hero shot and no move at
  // all.
  const covered = Math.min(Math.abs(lateralShiftRatio), 0.55)
  const effectiveAspect = (camera.aspect || 16 / 9) * (1 - covered)
  const distance = fitDistanceForAspect(bounds.size, camera.fov, effectiveAspect, padding)

  // Aim slightly above the middle of a tower: architecture reads better when
  // the mass sits low in frame.
  const target = bounds.center.clone()
  target.y += bounds.size.y * 0.08

  const position = target.clone().add(direction.multiplyScalar(distance))

  // Slide the whole framing sideways so the subject is not hidden behind an
  // open panel. Shifting camera and target together keeps the angle intact.
  // Positive pushes the subject left (right-hand panel), negative pushes right.
  if (lateralShiftRatio !== 0) {
    const vFov = (camera.fov * Math.PI) / 180
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (camera.aspect || 16 / 9))
    const visibleWidth = 2 * distance * Math.tan(hFov / 2)

    const forward = target.clone().sub(position).normalize()
    const right = forward.clone().cross(camera.up).normalize()
    const shift = right.multiplyScalar((visibleWidth * lateralShiftRatio) / 2)

    position.add(shift)
    target.add(shift)
  }

  return { position, target, distance, bounds }
}

/**
 * The single camera animation primitive. Everything — intro, tower focus,
 * inspector focus, reset — routes through here so timing stays consistent and
 * a new request always interrupts the previous one cleanly.
 */
export function animateCameraTo(camera, controls, pose, options = {}) {
  const {
    duration = 1.5,
    ease = 'power3.inOut',
    onComplete,
    immediate = false,
  } = options

  if (!camera || !controls) return null

  gsap.killTweensOf(camera.position)
  gsap.killTweensOf(controls.target)

  if (immediate) {
    camera.position.copy(pose.position)
    controls.target.copy(pose.target)
    controls.update()
    onComplete?.()
    return null
  }

  const wasEnabled = controls.enabled
  controls.enabled = false

  const timeline = gsap.timeline({
    onComplete: () => {
      controls.enabled = wasEnabled
      controls.update()
      onComplete?.()
    },
  })

  timeline.to(
    camera.position,
    { x: pose.position.x, y: pose.position.y, z: pose.position.z, duration, ease },
    0,
  )
  timeline.to(
    controls.target,
    { x: pose.target.x, y: pose.target.y, z: pose.target.z, duration, ease },
    0,
  )

  return timeline
}

/** Derive orbit limits from the model instead of guessing absolute numbers. */
export function deriveControlLimits(bounds) {
  return {
    minDistance: Math.max(bounds.radius * 0.08, 0.05),
    maxDistance: bounds.radius * 7,
    // Just shy of the horizon, so the camera can never slide under the site.
    maxPolarAngle: Math.PI * 0.495,
  }
}

/** Near/far planes scaled to the model, to keep depth precision usable. */
export function deriveClippingPlanes(bounds) {
  return {
    near: Math.max(bounds.radius / 1000, 0.01),
    far: bounds.radius * 60,
  }
}
