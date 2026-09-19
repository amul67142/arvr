import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'

/**
 * Full-bleed loading screen. Stays up until the model is parsed AND the
 * intro camera move has started, so the viewer is never revealed mid-flight.
 */
export default function LoadingOverlay({ ready }) {
  const { progress, active } = useProgress()
  const [dismissed, setDismissed] = useState(false)
  const [peak, setPeak] = useState(0)

  // Progress jumps backwards as sub-resources register with the loading
  // manager, so the bar tracks the high-water mark instead.
  const rounded = Math.round(progress)
  if (rounded > peak) setPeak(rounded)

  const shown = ready ? 100 : active ? Math.min(peak, 99) : peak

  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => setDismissed(true), 900)
    return () => clearTimeout(timer)
  }, [ready])

  if (dismissed) return null

  return (
    <div
      data-ready={ready}
      className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center bg-neutral-950 transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] data-[ready=true]:opacity-0"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_80%_at_50%_10%,#1c1c1c_0%,#0a0a0a_60%)]"
      />

      <div className="relative flex flex-col items-center">
        <p className="label-lg text-white/70">Loading Project</p>

        <p className="display mt-7 text-6xl tabular-nums text-white md:text-7xl">
          {shown}
          <span className="text-white/30">%</span>
        </p>

        <div className="mt-9 h-px w-56 overflow-hidden bg-white/10">
          <div
            className="h-full bg-white/70 transition-[width] duration-500 ease-out"
            style={{ width: `${shown}%` }}
          />
        </div>

        <p className="mt-7 text-xs tracking-[0.18em] text-white/35">
          Preparing 3D Experience...
        </p>
      </div>
    </div>
  )
}
