import { useEffect, useMemo, useRef, useState } from 'react'

import { ChevronIcon, LayersIcon } from '../common/Icons'

const MAP_WIDTH = 228
const PAD = 8

/**
 * The rooms of the walkthrough, twice over: as a list, and as a floor plan
 * with a "you are here" marker. Either one jumps you to a room.
 *
 * The marker moves every frame the buyer walks, so it is positioned through a
 * ref callback written straight to the SVG — never through React state.
 */
export default function RoomNavigator({ rooms, current, onJump, poseRef }) {
  const markerRef = useRef(null)
  const [open, setOpen] = useState(true)

  const plan = useMemo(() => {
    if (!rooms?.length) return null
    const minX = Math.min(...rooms.map((room) => room.bounds.minX))
    const maxX = Math.max(...rooms.map((room) => room.bounds.maxX))
    const minZ = Math.min(...rooms.map((room) => room.bounds.minZ))
    const maxZ = Math.max(...rooms.map((room) => room.bounds.maxZ))
    const scale = (MAP_WIDTH - PAD * 2) / Math.max(maxX - minX, 0.001)
    return {
      scale,
      minX,
      minZ,
      height: (maxZ - minZ) * scale + PAD * 2,
      toX: (x) => (x - minX) * scale + PAD,
      toY: (z) => (z - minZ) * scale + PAD,
    }
  }, [rooms])

  // Hand the controller a function that moves the marker.
  useEffect(() => {
    if (!poseRef) return
    poseRef.current = (x, z, yaw) => {
      const marker = markerRef.current
      if (!marker || !plan) return
      const degrees = (-yaw * 180) / Math.PI
      marker.setAttribute(
        'transform',
        `translate(${plan.toX(x).toFixed(1)} ${plan.toY(z).toFixed(1)}) rotate(${degrees.toFixed(1)})`,
      )
    }
    return () => {
      poseRef.current = null
    }
  }, [plan, poseRef])

  if (!rooms?.length || !plan) return null

  return (
    <aside className="pointer-events-none absolute top-28 bottom-24 left-6 z-20 flex w-[260px] flex-col md:top-32 md:left-8">
      <div className="glass pointer-events-auto flex min-h-0 flex-col">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center justify-between px-5 py-4 text-white/60 transition-colors hover:text-white"
        >
          <span className="flex items-center gap-2.5">
            <LayersIcon size={14} />
            <span className="label">Rooms</span>
          </span>
          <span data-open={open} className="transition-transform duration-300 data-[open=true]:rotate-90">
            <ChevronIcon size={12} />
          </span>
        </button>

        {open ? (
          <>
            <ul className="scroll-thin max-h-[34vh] min-h-0 overflow-y-auto border-t border-white/10 py-2">
              {rooms.map((room) => (
                <li key={room.id}>
                  <button
                    type="button"
                    onClick={() => onJump(room)}
                    data-current={room.id === current?.id}
                    className="group flex w-full items-baseline justify-between gap-3 px-5 py-2 text-left transition-colors hover:bg-white/[0.05] data-[current=true]:bg-white/[0.08]"
                  >
                    <span className="truncate text-[13px] font-light text-white/60 group-hover:text-white group-data-[current=true]:text-white">
                      {room.label}
                    </span>
                    {room.area ? (
                      <span className="shrink-0 text-[10px] tabular-nums text-white/30">
                        {room.area} m²
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>

            <div className="border-t border-white/10 px-4 py-4">
              <svg
                width={MAP_WIDTH}
                height={plan.height}
                viewBox={`0 0 ${MAP_WIDTH} ${plan.height}`}
                className="block max-w-full"
                role="img"
                aria-label="Floor plan"
              >
                {rooms.map((room) => {
                  const x = plan.toX(room.bounds.minX)
                  const y = plan.toY(room.bounds.minZ)
                  const w = (room.bounds.maxX - room.bounds.minX) * plan.scale
                  const h = (room.bounds.maxZ - room.bounds.minZ) * plan.scale
                  const isCurrent = room.id === current?.id
                  return (
                    <rect
                      key={room.id}
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      onClick={() => onJump(room)}
                      className="cursor-pointer transition-[fill] duration-300"
                      fill={isCurrent ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.05)'}
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth="0.75"
                    >
                      <title>{room.label}</title>
                    </rect>
                  )
                })}

                {/* You are here: a dot with a field-of-view wedge. At yaw 0
                    the camera looks down -Z, which is "up" on this plan. */}
                <g ref={markerRef} pointerEvents="none">
                  <path d="M0 0 L-9 -16 A18 18 0 0 1 9 -16 Z" fill="rgba(255,255,255,0.28)" />
                  <circle r="3.6" fill="#ffffff" />
                </g>
              </svg>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  )
}
