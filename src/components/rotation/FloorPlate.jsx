const SIZE = 320
const C = SIZE / 2
const R_OUT = 138
const R_IN = 46

/** An annular sector from a to b degrees (0 = east, counter-clockwise, north up). */
function sector(a, b, r0 = R_IN + 4, r1 = R_OUT) {
  const rad = (deg) => (-deg * Math.PI) / 180 // screen y points down
  const p = (r, deg) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))]
  const [x0, y0] = p(r1, a)
  const [x1, y1] = p(r1, b)
  const [x2, y2] = p(r0, b)
  const [x3, y3] = p(r0, a)
  const large = b - a > 180 ? 1 : 0
  return `M${x0} ${y0} A${r1} ${r1} 0 ${large} 0 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${large} 1 ${x3} ${y3}Z`
}

function labelAt(deg, r = (R_IN + R_OUT) / 2 + 4) {
  const rad = (-deg * Math.PI) / 180
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)]
}

/**
 * The floor as a plan: the round tower cut into its four homes, each in its
 * type's colour (grey when sold), north at the top. A diagram, not a render —
 * a project's real typical-floor plan replaces it once the studio sends one.
 */
export default function FloorPlate({ plan, units, typeColors, hoveredId, selectedId, onHover, onSelect }) {
  // A project without a typical-floor plan simply lists its homes.
  if (!plan?.length) return null
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto w-full max-w-[300px]" onPointerLeave={() => onHover(null)}>
      <circle cx={C} cy={C} r={R_OUT + 6} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      {plan.map((home) => {
        const unit = units.find((u) => u.code === home.code)
        if (!unit) return null
        const sold = unit.status === 'Sold'
        const active = hoveredId === unit.id || selectedId === unit.id
        const [lx, ly] = labelAt(home.start + 45)
        return (
          <g
            key={home.code}
            className="cursor-pointer"
            onPointerEnter={() => onHover(unit.id)}
            onClick={() => onSelect(unit.id)}
          >
            <path
              d={sector(home.start + 1.5, home.start + 88.5)}
              fill={sold ? '#6b6b6b' : (typeColors?.[unit.type] ?? '#9ca3af')}
              fillOpacity={active ? 0.75 : sold ? 0.3 : 0.38}
              stroke="white"
              strokeOpacity={active ? 1 : 0.55}
              strokeWidth={active ? 2.5 : 1}
              style={{ transition: 'fill-opacity 200ms, stroke-width 200ms' }}
            />
            <text x={lx} y={ly - 6} textAnchor="middle" fill="white" fontSize="20" fontFamily="inherit">
              {unit.flatNo}
            </text>
            <text x={lx} y={ly + 14} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="11" letterSpacing="1.5">
              {unit.type ? `${unit.type.replace('BHK', ' BHK')} · ` : ''}{sold ? 'SOLD' : unit.status.toUpperCase()}
            </text>
          </g>
        )
      })}
      <circle cx={C} cy={C} r={R_IN} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.35)" />
      <text x={C} y={C + 4} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10" letterSpacing="2">
        CORE
      </text>
      {/* North arrow */}
      <g transform={`translate(${SIZE - 22} 22)`}>
        <path d="M0 -12 L6 6 L0 2 L-6 6Z" fill="white" fillOpacity="0.8" />
        <text y="20" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="10">
          N
        </text>
      </g>
    </svg>
  )
}
