import { useEffect, useRef } from 'react'
import gsap from 'gsap'

import { useViewer } from '../../state/viewerStore'
import { TIME_OF_DAY } from '../../utils/envUtils'

/**
 * A shadow-only plane under the project. Uploaded masterplans often have no
 * ground geometry of their own, and a tower casting onto nothing reads as a
 * model floating in space rather than a building on a site.
 */
export default function GroundShadow({ enabled }) {
  const { model, timeOfDay } = useViewer()
  const materialRef = useRef(null)

  useEffect(() => {
    const material = materialRef.current
    if (!material) return

    const tween = gsap.to(material, {
      opacity: TIME_OF_DAY[timeOfDay].shadowOpacity,
      duration: 1.6,
      ease: 'power2.inOut',
    })

    return () => tween.kill()
  }, [timeOfDay])

  if (!enabled || !model) return null

  const { bounds } = model
  const extent = bounds.radius * 4

  return (
    <mesh
      receiveShadow
      rotation-x={-Math.PI / 2}
      position={[bounds.center.x, bounds.box.min.y - bounds.radius * 0.002, bounds.center.z]}
    >
      <planeGeometry args={[extent, extent]} />
      <shadowMaterial
        ref={materialRef}
        transparent
        opacity={TIME_OF_DAY[timeOfDay].shadowOpacity}
      />
    </mesh>
  )
}
