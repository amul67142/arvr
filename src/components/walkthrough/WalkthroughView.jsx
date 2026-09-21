import { Suspense, useCallback, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'

import { useFullscreen } from '../../hooks/useFullscreen'
import ModelErrorBoundary from '../common/ModelErrorBoundary'
import { CollapseIcon, ExpandIcon, MoonIcon, SunIcon } from '../common/Icons'
import LoadingOverlay from '../viewer/LoadingOverlay'
import FirstPersonController from './FirstPersonController'
import RoomNavigator from './RoomNavigator'
import WalkthroughLighting from './WalkthroughLighting'
import WalkthroughModel from './WalkthroughModel'

const SKY = {
  day: 'linear-gradient(to bottom, #9fb9d3 0%, #cdd9e3 55%, #e7e2d8 100%)',
  night: 'linear-gradient(to bottom, #04070d 0%, #0d1522 60%, #1a2230 100%)',
}

/**
 * First-person walkthrough of an interior or a landscaped site.
 *
 * Self-contained on purpose: its state (room, day/night) belongs to this one
 * visit, not to the project, and it shares nothing with the masterplan
 * viewer's store. What it shares is infrastructure — the loader, the decoders,
 * the baked environments, the loading screen.
 */
export default function WalkthroughView({ source, onError }) {
  const rootRef = useRef(null)
  const apiRef = useRef(null)
  const fadeRef = useRef(null)
  const poseRef = useRef(null)
  const fullscreen = useFullscreen(rootRef)

  const [walk, setWalk] = useState(null)
  const [room, setRoom] = useState(null)
  const [timeOfDay, setTimeOfDay] = useState('day')

  const jump = useCallback((target) => apiRef.current?.jumpTo(target), [])

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-neutral-950">
      {/* Sky seen through the windows: the canvas is transparent. */}
      <div aria-hidden className="absolute inset-0" style={{ background: SKY.day }} />
      <div
        aria-hidden
        className="absolute inset-0 transition-opacity duration-[1400ms]"
        style={{ background: SKY.night, opacity: timeOfDay === 'night' ? 1 : 0 }}
      />

      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 65, near: 0.05, far: 3000, position: [0, 1.6, 0] }}
        className="absolute inset-0"
      >
        <WalkthroughLighting walk={walk} timeOfDay={timeOfDay} />
        <ModelErrorBoundary onError={onError}>
          <Suspense fallback={null}>
            <WalkthroughModel source={source} onReady={setWalk} />
          </Suspense>
        </ModelErrorBoundary>
        {walk ? (
          <FirstPersonController
            walk={walk}
            apiRef={apiRef}
            fadeRef={fadeRef}
            poseRef={poseRef}
            onRoomChange={setRoom}
          />
        ) : null}
      </Canvas>

      {/* Room jumps cut through black rather than gliding through walls. */}
      <div ref={fadeRef} aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-black opacity-0" />

      {room ? (
        <div className="pointer-events-none absolute top-6 left-1/2 z-20 -translate-x-1/2 md:top-8">
          <div key={room.id} className="glass view-enter px-6 py-3 text-center">
            <p className="label text-white/45">You are in</p>
            <p className="display mt-1 text-xl text-white">
              {room.label}
              {room.area ? (
                <span className="ml-3 align-middle text-[11px] tracking-wider text-white/40">
                  {room.area} m²
                </span>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}

      <RoomNavigator rooms={walk?.rooms} current={room} onJump={jump} poseRef={poseRef} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 p-5 md:p-8">
        <p className="label hidden text-white/55 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)] md:block">
          Drag to look · W A S D to walk · Click the floor to move
        </p>
        <nav className="glass pointer-events-auto flex items-center gap-1 px-2.5 py-2">
          <button
            type="button"
            onClick={() => setTimeOfDay('day')}
            data-active={timeOfDay === 'day'}
            className="ctrl"
          >
            <SunIcon size={15} />
            <span className="label">Day</span>
          </button>
          <button
            type="button"
            onClick={() => setTimeOfDay('night')}
            data-active={timeOfDay === 'night'}
            className="ctrl"
          >
            <MoonIcon size={15} />
            <span className="label">Night</span>
          </button>
          <span aria-hidden className="mx-1 h-5 w-px bg-white/12" />
          <button type="button" onClick={fullscreen.toggle} className="ctrl">
            {fullscreen.isFullscreen ? <CollapseIcon size={15} /> : <ExpandIcon size={15} />}
            <span className="label hidden md:inline">
              {fullscreen.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </span>
          </button>
        </nav>
      </div>

      <LoadingOverlay ready={Boolean(walk)} />
    </div>
  )
}
