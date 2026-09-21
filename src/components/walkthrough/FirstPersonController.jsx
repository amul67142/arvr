// The camera is driven imperatively every frame; mutating three.js objects
// from useThree is the point of this component.
/* oxlint-disable react/immutability */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'

const EYE = 1.6 // metres
const WALK = 1.6 // metres per second — an unhurried viewing pace
const HURRY = 3.2
const TURN = 1.9 // radians per second for arrow-key turning
const RADIUS = 0.28 // how close you can get to a wall
const STEP = 0.45 // largest step up or down you can take
const LOOK = 0.0032 // radians per dragged pixel
const PITCH_LIMIT = (70 * Math.PI) / 180
const RAY_HEIGHTS = [0.3, 0.95, 1.5] // knees, hips, shoulders
const CLICK_SLOP = 6 // pixels a press can travel and still count as a click

const DOWN = new THREE.Vector3(0, -1, 0)

function isTyping(event) {
  const tag = event.target?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable
}

/**
 * First-person movement through a walkthrough model.
 *
 * Collision is plain raycasting against the model's solid meshes at three body
 * heights, which is enough for an apartment or a garden and needs no physics
 * engine. Where you stand is decided by a downward ray against walkable floors,
 * so steps onto a balcony just work and there is no way off the edge.
 */
export default function FirstPersonController({ walk, apiRef, fadeRef, poseRef, onRoomChange }) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)

  const ray = useMemo(() => new THREE.Raycaster(), [])
  const scratch = useMemo(
    () => ({ origin: new THREE.Vector3(), dir: new THREE.Vector3(), ndc: new THREE.Vector2() }),
    [],
  )
  const discRef = useRef(null)

  const state = useRef({
    pos: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    targetYaw: 0,
    targetPitch: 0,
    keys: new Set(),
    walkTo: null,
    room: null,
    drag: null,
    lastPose: '',
  })

  // ------------------------------------------------------------ physics --

  const floorAt = (x, y, z) => {
    const { origin } = scratch
    origin.set(x, y + STEP + 0.6, z)
    ray.set(origin, DOWN)
    ray.near = 0
    ray.far = STEP * 2 + 0.8
    const hit = ray.intersectObjects(walk.walkables, false)[0]
    if (!hit || Math.abs(hit.point.y - y) > STEP) return null
    return hit
  }

  const blocked = (from, dx, dz, distance) => {
    const { origin, dir } = scratch
    dir.set(dx, 0, dz).normalize()
    for (const height of RAY_HEIGHTS) {
      origin.set(from.x, from.y + height, from.z)
      ray.set(origin, dir)
      ray.near = 0
      ray.far = distance + RADIUS
      if (ray.intersectObjects(walk.colliders, false).length > 0) return true
    }
    return false
  }

  const tryMove = (dx, dz) => {
    const s = state.current
    const distance = Math.hypot(dx, dz)
    if (distance < 1e-6) return false
    if (blocked(s.pos, dx, dz, distance)) return false
    const hit = floorAt(s.pos.x + dx, s.pos.y, s.pos.z + dz)
    if (!hit) return false
    s.pos.set(s.pos.x + dx, hit.point.y, s.pos.z + dz)
    const room = hit.object.userData.__room ?? null
    if (room && room !== s.room) {
      s.room = room
      onRoomChange?.(room)
    }
    return true
  }

  /** Move, and if a wall is in the way, slide along it rather than stop dead. */
  const move = (dx, dz) =>
    tryMove(dx, dz) || (Math.abs(dx) > 1e-4 && tryMove(dx, 0)) || (Math.abs(dz) > 1e-4 && tryMove(0, dz))

  // ------------------------------------------------------------- setup --

  const placeAt = (x, y, z, yaw) => {
    const s = state.current
    const hit = floorAt(x, y, z)
    s.pos.set(x, hit ? hit.point.y : y, z)
    s.yaw = s.targetYaw = yaw
    s.pitch = s.targetPitch = -0.04
    s.walkTo = null
    const room = hit?.object.userData.__room ?? null
    if (room !== s.room) {
      s.room = room
      onRoomChange?.(room)
    }
  }

  useEffect(() => {
    if (!walk?.spawn) return
    camera.fov = 65
    camera.near = 0.05
    camera.far = 3000
    camera.rotation.order = 'YXZ'
    camera.updateProjectionMatrix()
    const { position, yaw } = walk.spawn
    placeAt(position.x, position.y, position.z, yaw)
    // placeAt is stable in practice (reads refs); walk is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, walk])

  // Public API: jump to a room behind a quick fade, never through walls.
  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      jumpTo(room) {
        const go = () => placeAt(room.view.x, room.floorY, room.view.z, room.view.yaw)
        const fade = fadeRef?.current
        if (!fade) return go()
        gsap.killTweensOf(fade)
        gsap
          .timeline()
          .to(fade, { opacity: 1, duration: 0.28, ease: 'power2.in' })
          .add(go)
          .to(fade, { opacity: 0, duration: 0.5, ease: 'power2.out' })
      },
    }
    return () => {
      apiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRef, fadeRef, walk])

  // ------------------------------------------------------------- input --

  useEffect(() => {
    const element = gl.domElement
    element.style.touchAction = 'none'
    element.style.cursor = 'grab'

    const pickFloor = (event) => {
      const rect = element.getBoundingClientRect()
      scratch.ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      ray.setFromCamera(scratch.ndc, camera)
      ray.near = 0
      ray.far = 60
      // Nearest of floors and solids: a floor behind a wall does not count.
      const hit = ray.intersectObjects([...walk.walkables, ...walk.colliders], false)[0]
      return hit && hit.object.userData.__walkable ? hit : null
    }

    const onDown = (event) => {
      state.current.drag = { x: event.clientX, y: event.clientY, travelled: 0 }
      element.setPointerCapture?.(event.pointerId)
      element.style.cursor = 'grabbing'
    }

    const onMove = (event) => {
      const s = state.current
      if (s.drag) {
        const dx = event.clientX - s.drag.x
        const dy = event.clientY - s.drag.y
        s.drag.x = event.clientX
        s.drag.y = event.clientY
        s.drag.travelled += Math.abs(dx) + Math.abs(dy)
        // Grab-the-world: dragging right swings the view left, like a photo.
        s.targetYaw += dx * LOOK
        s.targetPitch = THREE.MathUtils.clamp(s.targetPitch + dy * LOOK, -PITCH_LIMIT, PITCH_LIMIT)
        if (discRef.current) discRef.current.visible = false
        return
      }

      // Hovering: show where a click would take you.
      const disc = discRef.current
      if (!disc || event.pointerType === 'touch') return
      const hit = pickFloor(event)
      disc.visible = Boolean(hit)
      if (hit) disc.position.set(hit.point.x, hit.point.y + 0.012, hit.point.z)
    }

    const onUp = (event) => {
      const s = state.current
      const drag = s.drag
      s.drag = null
      element.style.cursor = 'grab'
      if (!drag || drag.travelled > CLICK_SLOP) return
      const hit = pickFloor(event)
      if (hit) s.walkTo = hit.point.clone()
    }

    const onLeave = () => {
      if (discRef.current) discRef.current.visible = false
    }

    const onWheel = (event) => {
      event.preventDefault()
      camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * 0.03, 40, 80)
      camera.updateProjectionMatrix()
    }

    const onKeyDown = (event) => {
      if (isTyping(event)) return
      const key = event.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
        state.current.keys.add(key)
        state.current.walkTo = null
        if (key.startsWith('arrow')) event.preventDefault()
      }
    }
    const onKeyUp = (event) => state.current.keys.delete(event.key.toLowerCase())
    const onBlur = () => state.current.keys.clear()

    element.addEventListener('pointerdown', onDown)
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', onUp)
    element.addEventListener('pointerleave', onLeave)
    element.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    return () => {
      element.removeEventListener('pointerdown', onDown)
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', onUp)
      element.removeEventListener('pointerleave', onLeave)
      element.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      element.style.cursor = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl, walk])

  // ------------------------------------------------------------- frame --

  useFrame((_, rawDelta) => {
    const s = state.current
    const dt = Math.min(rawDelta, 0.05)
    const keys = s.keys

    if (keys.has('arrowleft')) s.targetYaw += TURN * dt
    if (keys.has('arrowright')) s.targetYaw -= TURN * dt

    // Heavily damped look: a buyer should feel steady, not twitchy.
    const ease = 1 - Math.exp(-14 * dt)
    s.yaw += (s.targetYaw - s.yaw) * ease
    s.pitch += (s.targetPitch - s.pitch) * ease

    const forward = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0)
    const strafe = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0)
    const speed = (keys.has('shift') ? HURRY : WALK) * dt

    if (forward || strafe) {
      const sin = Math.sin(s.yaw)
      const cos = Math.cos(s.yaw)
      // Forward is -Z rotated by yaw; right is +X rotated by yaw.
      let dx = -sin * forward + cos * strafe
      let dz = -cos * forward - sin * strafe
      const length = Math.hypot(dx, dz)
      dx = (dx / length) * speed
      dz = (dz / length) * speed
      move(dx, dz)
    } else if (s.walkTo) {
      const dx = s.walkTo.x - s.pos.x
      const dz = s.walkTo.z - s.pos.z
      const distance = Math.hypot(dx, dz)
      if (distance < 0.1) {
        s.walkTo = null
      } else {
        const step = Math.min(distance, WALK * 1.4 * dt)
        if (!move((dx / distance) * step, (dz / distance) * step)) s.walkTo = null
      }
    }

    camera.position.set(s.pos.x, s.pos.y + EYE, s.pos.z)
    camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ')

    // Minimap marker, written straight to the DOM — no React render per frame.
    const pose = `${s.pos.x.toFixed(2)},${s.pos.z.toFixed(2)},${s.yaw.toFixed(3)}`
    if (pose !== s.lastPose) {
      s.lastPose = pose
      poseRef?.current?.(s.pos.x, s.pos.z, s.yaw)
    }
  })

  return (
    <mesh ref={discRef} rotation-x={-Math.PI / 2} visible={false} renderOrder={10}>
      <ringGeometry args={[0.17, 0.23, 48]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.75} depthWrite={false} />
    </mesh>
  )
}
