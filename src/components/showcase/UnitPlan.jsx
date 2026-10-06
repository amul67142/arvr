const WALL = '#f2efe8'

/** Split a wall's run into solid pieces around its openings. */
function segments(wall) {
  const pieces = []
  let cursor = 0
  const length = wall.to - wall.from
  for (const o of [...wall.openings].sort((a, b) => a.from - b.from)) {
    if (o.from > cursor) pieces.push([cursor, o.from])
    cursor = Math.max(cursor, o.from + o.width)
  }
  if (cursor < length) pieces.push([cursor, length])
  return pieces
}

/** A point along a wall, in plan coordinates. */
function along(wall, t) {
  return wall.axis === 'x' ? [wall.from + t, wall.at] : [wall.at, wall.from + t]
}

/**
 * A home's plan, drawn from the same data the walkthrough was built from:
 * rooms with their areas, walls with door gaps, windows in blue. Metres in,
 * SVG out — no image, so it stays crisp at any size.
 */
export default function UnitPlan({ plan }) {
  const [x0, z0, x1, z1] = plan.bounds
  const pad = 0.6
  const viewBox = `${x0 - pad} ${z0 - pad} ${x1 - x0 + pad * 2} ${z1 - z0 + pad * 2}`

  return (
    <svg viewBox={viewBox} className="w-full" role="img" aria-label={`${plan.type} floor plan`}>
      {plan.rooms.map((room) => {
        const [rx0, rz0, rx1, rz1] = room.rect
        return (
          <rect
            key={room.id}
            x={rx0}
            y={rz0}
            width={rx1 - rx0}
            height={rz1 - rz0}
            fill={room.outdoor ? 'rgba(160,190,150,0.14)' : 'rgba(255,255,255,0.05)'}
          />
        )
      })}

      {plan.walls.map((wall, i) =>
        segments(wall).map(([a, b]) => {
          const [ax, az] = along(wall, a)
          const [bx, bz] = along(wall, b)
          return (
            <line
              key={`${i}-${a}`}
              x1={ax}
              y1={az}
              x2={bx}
              y2={bz}
              stroke={WALL}
              strokeOpacity={wall.low ? 0.45 : 0.9}
              strokeWidth={Math.max(0.08, wall.thickness)}
              strokeLinecap="square"
            />
          )
        }),
      )}

      {plan.walls.flatMap((wall, i) =>
        wall.openings
          .filter((o) => o.kind === 'window')
          .map((o) => {
            const [ax, az] = along(wall, o.from)
            const [bx, bz] = along(wall, o.from + o.width)
            return (
              <line key={`w${i}-${o.from}`} x1={ax} y1={az} x2={bx} y2={bz} stroke="#8fc4ff" strokeWidth="0.07" />
            )
          }),
      )}

      {plan.rooms.map((room) => {
        const [rx0, rz0, rx1, rz1] = room.rect
        // Fit the name inside the room: roughly 0.55 em per character.
        const size = Math.min(0.42, (rx1 - rx0 - 0.3) / (room.label.length * 0.55), (rz1 - rz0) / 3)
        return (
          <g key={`t-${room.id}`} transform={`translate(${(rx0 + rx1) / 2} ${(rz0 + rz1) / 2})`}>
            <text textAnchor="middle" fill="white" fillOpacity="0.85" fontSize={size} y={-size * 0.2}>
              {room.label}
            </text>
            <text textAnchor="middle" fill="white" fillOpacity="0.45" fontSize={size * 0.8} y={size * 1.05}>
              {room.area} m²
            </text>
          </g>
        )
      })}
    </svg>
  )
}
