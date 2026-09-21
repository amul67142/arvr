import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'

import { useFullscreen } from '../../hooks/useFullscreen'
import { useViewer } from '../../state/viewerStore'
import { TIME_OF_DAY, applyPageGradient } from '../../utils/envUtils'
import ModelErrorBoundary from '../common/ModelErrorBoundary'
import CameraController from './CameraController'
import GroundShadow from './GroundShadow'
import LightingController from './LightingController'
import LoadingOverlay from './LoadingOverlay'
import ModelInspector from './ModelInspector'
import TowerInfoPanel from './TowerInfoPanel'
import UploadedModel from './UploadedModel'
import ViewerControls from './ViewerControls'

/**
 * The Phase 1 3D viewer, unchanged in behaviour. Two optional props let it sit
 * inside a larger experience without knowing about one:
 *
 *   chrome  which surrounding controls to show. Every flag defaults to true,
 *           so rendered on its own this is exactly the Phase 1 viewer.
 *   paused  stops the render loop while the view is kept alive off-screen.
 *           The scene, camera and selection all survive; nothing is drawn.
 */
export default function ProjectViewer({ source, onExit, onError, chrome = {}, paused = false }) {
  const showInspector = chrome.showInspector !== false

  const rootRef = useRef(null)
  const fullscreen = useFullscreen(rootRef)
  const { model, hoverLabelRef, inspectorOpen, setInspectorOpen, clearSelection } =
    useViewer()

  const [revealed, setRevealed] = useState(false)

  // Paint the page gradient before the first frame so nothing flashes.
  useEffect(() => {
    const preset = TIME_OF_DAY.day
    applyPageGradient(preset.pageTop, preset.pageBottom)
  }, [])

  // Hand over from the loading screen once the model exists and one frame has
  // been painted; the intro camera move then plays through the fade.
  useEffect(() => {
    if (!model) return
    const frame = requestAnimationFrame(() => setRevealed(true))
    return () => cancelAnimationFrame(frame)
  }, [model])

  useEffect(() => {
    // A view kept alive off-screen must not react to keys meant for the
    // view the buyer is actually looking at.
    if (paused) return

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      if (inspectorOpen) setInspectorOpen(false)
      else clearSelection()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearSelection, inspectorOpen, paused, setInspectorOpen])

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-neutral-950">
      <div
        aria-hidden
        className="absolute inset-0 transition-none"
        style={{
          background:
            'linear-gradient(to bottom, var(--sky-top, #e9ecef) 0%, var(--sky-bottom, #f6f4f0) 100%)',
        }}
      />

      <Canvas
        frameloop={paused ? 'never' : 'always'}
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 45, near: 0.1, far: 5000, position: [12, 8, 12] }}
        className="absolute inset-0"
      >
        <LightingController shadowsEnabled={model?.shadowsEnabled ?? false} />
        <GroundShadow enabled={model?.shadowsEnabled ?? false} />

        <ModelErrorBoundary onError={onError}>
          <Suspense fallback={null}>
            <UploadedModel source={source} />
          </Suspense>
        </ModelErrorBoundary>

        <CameraController />
      </Canvas>

      {/* Follows the cursor without a single React re-render. */}
      <div
        ref={hoverLabelRef}
        data-visible="false"
        className="glass label pointer-events-none fixed top-0 left-0 z-30 px-3.5 py-2 text-white/85 opacity-0 transition-opacity duration-300 data-[visible=true]:opacity-100"
      />

      <ViewerControls
        source={source}
        onExit={onExit}
        fullscreen={fullscreen}
        chrome={chrome}
      />
      {showInspector ? <ModelInspector source={source} /> : null}
      <TowerInfoPanel />

      <LoadingOverlay ready={revealed} />
    </div>
  )
}
