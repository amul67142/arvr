import { useEffect, useRef } from 'react'

const WALL = 'rgba(255,255,255,0.45)'

/**
 * Where you are standing, on the home's own floor plan.
 *
 * The plan is the same file the walkthrough and the unit drawer are drawn
 * from, so a room can never be in two places. Each 360° camera is a dot; the
 * one you are in carries a cone showing which way you are facing, driven
 * straight from the look controls rather than from React state — it moves
 * every frame and must not cost a render.
 *
 * The facing is approximate until the studio marks each camera's angle on the
 * plan, which the render brief asks for.
 */
export default function MiniMap({ plan, rooms, roomIndex, look, onGo, open, onToggle }) {
  const coneRef = useRef(null)
  const current = rooms?.[roomIndex]

  useEffect(() => {
    if (!open || !current?.at) return undefined
    const cone = coneRef.current
    if (!cone) return undefined
    const yawAtOpen = look.current.yaw
    const base = current.faceAt ?? 270

    // A timer, not an animation frame: this is chrome, it does not need 60 Hz.
    const id = setInterval(() => {
      const turned = (look.current.yaw - yawAtOpen) * (-180 / Math.PI)
      cone.setAttribute('transform', `rotate(${(base + turned).toFixed(1)} ${current.at[0]} ${current.at[1]})`)
    }, 60)
    return () => clearInterval(id)
  }, [current, look, open, roomIndex])

  if (!plan) return null

  const [x0, z0, x1, z1] = plan.bounds
  const pad = 0.8
  const viewBox = `${x0 - pad} ${z0 - pad} ${x1 - x0 + pad * 2} ${z1 - z0 + pad * 2}`
  const span = Math.max(x1 - x0, z1 - z0)
  const dot = span / 90

  return (
    <div className="absolute bottom-24 left-6 z-20">
      {open ? (
        <div className="glass p-3">
          <svg viewBox={viewBox} className="block w-[220px]" role="img" aria-label="Where you are in the home">
            {plan.rooms.map((room) => {
              const [rx0, rz0, rx1, rz1] = room.rect
              return (
                <rect
                  key={room.id}
                  x={rx0}
                  y={rz0}
                  width={rx1 - rx0}
                  height={rz1 - rz0}
                  fill={room.outdoor ? 'rgba(160,190,150,0.12)' : 'rgba(255,255,255,0.06)'}
                  stroke={WALL}
                  strokeWidth={span / 260}
                />
              )
            })}

            {/* Every camera in the tour, and the one you are standing at. */}
            {rooms.map((room, index) => {
              if (!room.at) return null
              const here = index === roomIndex
              return (
                <g key={room.id} className="cursor-pointer" onClick={() => onGo(index)}>
                  {here ? (
                    <g ref={coneRef}>
                      <path
                        d={`M${room.at[0]} ${room.at[1]} L${room.at[0] + span / 5} ${room.at[1] - span / 14} L${room.at[0] + span / 5} ${room.at[1] + span / 14}Z`}
                        fill="#e0ad62"
                        fillOpacity="0.45"
                      />
                    </g>
                  ) : null}
                  <circle
                    cx={room.at[0]}
                    cy={room.at[1]}
                    r={here ? dot * 1.8 : dot * 1.2}
                    fill={here ? '#f3cf93' : 'rgba(255,255,255,0.55)'}
                    stroke="rgba(0,0,0,0.5)"
                    strokeWidth={span / 400}
                  />
                </g>
              )
            })}
          </svg>
          <button
            type="button"
            onClick={onToggle}
            className="label mt-2 w-full py-1 text-white/45 transition-colors hover:text-white"
          >
            Hide plan
          </button>
        </div>
      ) : (
        <button type="button" onClick={onToggle} className="glass label px-4 py-2.5 text-white/70 hover:text-white">
          Show plan
        </button>
      )}
    </div>
  )
}
