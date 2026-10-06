// Three.js objects from useThree are long-lived scene graph nodes; driving
// them imperatively is the point of this component.
/* oxlint-disable react/immutability */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Html } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'

import { assetBase } from '../../experience/assetSources'
import { useFullscreen } from '../../hooks/useFullscreen'
import { CollapseIcon, ExpandIcon } from '../common/Icons'
import MiniMap from './MiniMap'

const FOV = { min: 35, max: 90, start: 72 }
const IDLE_DRIFT = 0.018 // rad/s of slow turning until someone touches it
const HOTSPOT_RADIUS = 30

/**
 * Where a point of the equirectangular image sits around the viewer. Matches
 * PanoSphere below: u runs round the horizon, v from top (0) to bottom (1).
 */
function directionOf(u, v) {
  const phi = u * Math.PI * 2
  const theta = v * Math.PI
  return new THREE.Vector3(Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta))
}

/** Camera yaw that faces image column u (camera yaw 0 looks down -Z). */
const yawFacing = (u) => {
  const phi = u * Math.PI * 2
  return Math.atan2(-Math.cos(phi), -Math.sin(phi))
}

/** A doorway marker: click it to walk into the next room. */
function RoomLink({ link, onGo }) {
  const position = useMemo(() => directionOf(link.u, link.v).multiplyScalar(HOTSPOT_RADIUS), [link])
  return (
    <Html position={position} center zIndexRange={[20, 0]}>
      <button
        type="button"
        onClick={() => onGo(link.to)}
        onPointerDown={(event) => event.stopPropagation()}
        className="group flex flex-col items-center gap-2"
      >
        <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-white/90 bg-black/35 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
          <span className="h-3 w-3 rounded-full bg-white" />
        </span>
        <span className="glass label whitespace-nowrap px-3 py-1.5 text-white/90 opacity-80 transition-opacity group-hover:opacity-100">
          {link.label}
        </span>
      </button>
    </Html>
  )
}

/**
 * A note pinned to something in the room — a dimension, a finish, a view.
 * Closed it is a dot; opened it is a line of text, so a room can carry a dozen
 * without becoming a noticeboard.
 */
function InfoTag({ tag, open, onToggle }) {
  const position = useMemo(() => directionOf(tag.u, tag.v).multiplyScalar(HOTSPOT_RADIUS), [tag])
  return (
    <Html position={position} center zIndexRange={[18, 0]}>
      <button
        type="button"
        onClick={onToggle}
        onPointerDown={(event) => event.stopPropagation()}
        className="flex flex-col items-center gap-1.5"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full border border-white/80 bg-black/45 text-[11px] text-white backdrop-blur-sm">
          i
        </span>
        {open ? (
          <span className="glass w-56 px-3 py-2 text-left">
            <span className="label block text-white/45">{tag.label}</span>
            <span className="mt-1 block text-[12px] leading-relaxed text-white/85">{tag.text}</span>
          </span>
        ) : null}
      </button>
    </Html>
  )
}

/** Turning the phone turns the view. Safari needs asking first. */
function useGyroscope(look, enabled) {
  useEffect(() => {
    if (!enabled) return undefined
    const onOrient = (event) => {
      if (event.alpha === null) return
      const screen = ((window.screen?.orientation?.angle ?? 0) * Math.PI) / 180
      const s = look.current
      s.targetYaw = (event.alpha * Math.PI) / 180 + screen
      s.targetPitch = THREE.MathUtils.clamp(((event.beta - 90) * Math.PI) / 180, -1.3, 1.3)
      s.touched = performance.now()
    }
    window.addEventListener('deviceorientation', onOrient)
    return () => window.removeEventListener('deviceorientation', onOrient)
  }, [enabled, look])
}

/** Drag to look (grab-the-world), wheel to zoom, a slow drift when idle. */
function LookControls({ look }) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    camera.rotation.order = 'YXZ'
    const el = gl.domElement
    const s = look.current
    let last = null

    const down = (event) => {
      last = { x: event.clientX, y: event.clientY }
      s.touched = performance.now()
      el.setPointerCapture?.(event.pointerId)
    }
    const move = (event) => {
      if (!last) return
      const k = (camera.fov / el.clientHeight) * (Math.PI / 180)
      s.targetYaw += (event.clientX - last.x) * k
      s.targetPitch = THREE.MathUtils.clamp(s.targetPitch + (event.clientY - last.y) * k, -1.3, 1.3)
      last = { x: event.clientX, y: event.clientY }
      s.touched = performance.now()
    }
    const up = () => {
      last = null
    }
    const wheel = (event) => {
      event.preventDefault()
      s.targetFov = THREE.MathUtils.clamp(s.targetFov + event.deltaY * 0.04, FOV.min, FOV.max)
      s.touched = performance.now()
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [camera, gl, look])

  useFrame((_, delta) => {
    const s = look.current
    if (performance.now() - s.touched > 4000) s.targetYaw += IDLE_DRIFT * delta
    const ease = 1 - Math.exp(-delta * 10)
    s.yaw += (s.targetYaw - s.yaw) * ease
    s.pitch += (s.targetPitch - s.pitch) * ease
    camera.rotation.set(s.pitch, s.yaw, 0)
    if (Math.abs(camera.fov - s.targetFov) > 0.01) {
      camera.fov += (s.targetFov - camera.fov) * ease
      camera.updateProjectionMatrix()
    }
  })

  return null
}

/** The photo on the inside of a sphere. */
function PanoSphere({ texture }) {
  const geometry = useMemo(() => {
    const sphere = new THREE.SphereGeometry(50, 96, 48)
    sphere.scale(-1, 1, 1) // look at the inside
    return sphere
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

/**
 * Photographic 360° rooms — real photos or renders, not a model. A manifest
 * lists several rooms; a single uploaded image is one room.
 */
export default function PanoramaView({ asset }) {
  const [manifest, setManifest] = useState(null)
  const [manifestRooms, setManifestRooms] = useState(null)
  const [roomIndex, setRoomIndex] = useState(0)
  const [texture, setTexture] = useState(null)
  const [error, setError] = useState(null)
  const [variant, setVariant] = useState(null)
  const [plan, setPlan] = useState(null)
  const [mapOpen, setMapOpen] = useState(true)
  const [openTag, setOpenTag] = useState(null)
  const [gyro, setGyro] = useState(false)
  const shellRef = useRef(null)
  const fadeRef = useRef(null)
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(shellRef)
  const look = useRef({ yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0, targetFov: FOV.start, touched: 0 })

  // Rooms: a single uploaded image is one room; a manifest (demo) lists them.
  const isManifest = asset.extension === 'json'
  const singleRoom = useMemo(
    () => (isManifest ? null : [{ id: 'room', label: asset.name.replace(/\.[^.]+$/, ''), url: asset.url }]),
    [asset, isManifest],
  )
  const rooms = singleRoom ?? manifestRooms
  const variants = manifest?.variants ?? null

  /** Which image a room shows, given the chosen time of day or finish. */
  const urlOf = useCallback(
    (room) => (variant && room.srcs?.[variant] ? room.base + room.srcs[variant] : room.url),
    [variant],
  )

  useEffect(() => {
    if (!isManifest) return
    let cancelled = false
    const base = assetBase(asset)
    fetch(asset.url)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return
        setManifest(data)
        setVariant(data.variants?.[0]?.id ?? null)
        setManifestRooms(data.rooms.map((room) => ({ ...room, base, url: base + room.src })))
        if (data.plan) {
          fetch(data.plan.startsWith('/') ? data.plan : base + data.plan)
            .then((response) => response.json())
            .then((loaded) => !cancelled && setPlan(loaded))
            .catch(() => {
              // No plan is not an error; the tour simply has no mini-map.
            })
        }
      })
      .catch((reason) => !cancelled && setError(String(reason?.message ?? reason)))
    return () => {
      cancelled = true
    }
  }, [asset, isManifest])

  // Load the room's photo, then fade it in; dispose the one it replaces.
  useEffect(() => {
    const room = rooms?.[roomIndex]
    if (!room) return
    let cancelled = false
    let loaded = null
    new THREE.TextureLoader().load(
      urlOf(room),
      (tex) => {
        if (cancelled) return tex.dispose()
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 4
        loaded = tex
        const s = look.current
        s.targetYaw = s.yaw = room.look !== undefined ? yawFacing(room.look) : (room.yaw ?? 0) * (Math.PI / 180)
        s.targetPitch = s.pitch = 0
        setTexture(tex)
        if (fadeRef.current) gsap.to(fadeRef.current, { opacity: 0, duration: 0.6, ease: 'power2.out' })
      },
      undefined,
      () => !cancelled && setError(`Could not load ${room.label}`),
    )
    return () => {
      cancelled = true
      loaded?.dispose()
    }
  }, [roomIndex, rooms, urlOf])

  /**
   * Warm the rooms a buyer can reach from here, then the rest.
   *
   * Walking through a door should not mean waiting for a 12 MB panorama, so
   * the browser is asked for them in the background while this room is being
   * looked at — doors first, because that is where people go.
   */
  useEffect(() => {
    if (!rooms?.length) return
    const here = rooms[roomIndex]
    if (!here) return
    const next = (here.links ?? []).map((link) => rooms.find((room) => room.id === link.to)).filter(Boolean)
    const order = [...next, ...rooms.filter((room) => room !== here && !next.includes(room))]
    const timers = order.map((room, i) =>
      setTimeout(() => {
        const image = new Image()
        image.decoding = 'async'
        image.src = urlOf(room)
      }, 400 + i * 250),
    )
    return () => timers.forEach(clearTimeout)
  }, [roomIndex, rooms, urlOf])

  useGyroscope(look, gyro)

  /** iOS will not send orientation events without being asked, by a tap. */
  const askForGyro = async () => {
    const api = window.DeviceOrientationEvent
    if (api?.requestPermission) {
      try {
        if ((await api.requestPermission()) !== 'granted') return
      } catch {
        return
      }
    }
    setGyro((on) => !on)
  }

  const goToRoomId = (id) => {
    const index = rooms?.findIndex((r) => r.id === id) ?? -1
    if (index >= 0) goToRoom(index)
  }

  const goToRoom = (index) => {
    if (index === roomIndex) return
    setOpenTag(null)
    const fade = fadeRef.current
    if (!fade) return setRoomIndex(index)
    gsap.to(fade, { opacity: 1, duration: 0.3, ease: 'power2.in', onComplete: () => setRoomIndex(index) })
  }

  if (error) {
    return <div className="grid h-full place-items-center text-sm text-white/50">{error}</div>
  }

  const room = rooms?.[roomIndex]

  return (
    <div ref={shellRef} className="absolute inset-0 bg-neutral-950">
      <Canvas
        flat
        dpr={[1, 2]}
        camera={{ fov: FOV.start, near: 0.1, far: 200, position: [0, 0, 0] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        className="cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        {texture ? <PanoSphere texture={texture} /> : null}
        {texture
          ? (rooms?.[roomIndex]?.links ?? []).map((link) => (
              <RoomLink key={`${roomIndex}-${link.to}-${link.u}`} link={link} onGo={goToRoomId} />
            ))
          : null}
        {texture
          ? (rooms?.[roomIndex]?.tags ?? []).map((tag, index) => (
              <InfoTag
                key={`${roomIndex}-tag-${index}`}
                tag={tag}
                open={openTag === index}
                onToggle={() => setOpenTag(openTag === index ? null : index)}
              />
            ))
          : null}
        <LookControls look={look} />
      </Canvas>

      <div ref={fadeRef} className="pointer-events-none absolute inset-0 bg-neutral-950" />

      {room ? (
        <div className="absolute top-6 right-6 flex flex-col items-end gap-2">
          <div className="glass pointer-events-none px-5 py-3 text-right">
            <p className="label text-white/40">You are in</p>
            <p className="display mt-1 text-2xl text-white">{room.label}</p>
          </div>

          <div className="flex gap-2">
            {/* Day, night, furnished — whatever the studio rendered. */}
            {variants?.length > 1 ? (
              <div className="glass flex overflow-hidden">
                {variants.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setVariant(option.id)}
                    data-active={variant === option.id}
                    className="label px-3.5 py-2 text-white/55 transition-colors hover:text-white data-[active=true]:bg-white data-[active=true]:text-neutral-950"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}

            {typeof window !== 'undefined' && window.DeviceOrientationEvent ? (
              <button
                type="button"
                onClick={askForGyro}
                data-active={gyro}
                className="glass label px-3.5 py-2 text-white/55 hover:text-white data-[active=true]:bg-white data-[active=true]:text-neutral-950"
              >
                Tilt
              </button>
            ) : null}

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Leave fullscreen' : 'Fullscreen'}
              className="glass ctrl px-3 py-2"
            >
              {isFullscreen ? <CollapseIcon size={14} /> : <ExpandIcon size={14} />}
            </button>
          </div>
        </div>
      ) : null}

      {plan && rooms?.length > 1 ? (
        <MiniMap
          plan={plan}
          rooms={rooms}
          roomIndex={roomIndex}
          look={look}
          onGo={goToRoom}
          open={mapOpen}
          onToggle={() => setMapOpen((value) => !value)}
        />
      ) : null}

      {rooms && rooms.length > 1 ? (
        <nav className="glass absolute bottom-8 left-1/2 flex max-w-[92vw] -translate-x-1/2 gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none]">
          {rooms.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goToRoom(index)}
              data-active={index === roomIndex}
              className="label shrink-0 px-4 py-2.5 text-white/55 transition-colors duration-300 hover:text-white data-[active=true]:bg-white data-[active=true]:text-neutral-950"
            >
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}

      <p className="label pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 text-white/40">
        Drag to look around · scroll to zoom
      </p>
    </div>
  )
}
