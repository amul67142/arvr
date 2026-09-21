// Lights and the scene environment are long-lived three.js objects driven
// imperatively by GSAP; that is what this component is for.
/* oxlint-disable react/immutability */
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'

import { bakeEnvironments } from '../../utils/envUtils'

/**
 * Interior-first lighting. Day is sun through the windows with real shadows on
 * the floor; night is the flat's own warm lamps with moonlight outside.
 *
 * Night lamps exist in the scene all the time at zero intensity. Adding or
 * removing lights recompiles every shader in three.js, which would stutter the
 * moment the buyer taps Night — changing intensity costs nothing.
 */
const PRESETS = {
  day: {
    sun: 3.2,
    sunColor: '#fff1dc',
    hemi: 0.55,
    env: 0.85,
    lamps: 0,
    exposure: 1.0,
  },
  night: {
    sun: 0.12,
    sunColor: '#8fa6cc',
    hemi: 0.12,
    env: 0.18,
    lamps: 1,
    exposure: 1.05,
  },
}

export default function WalkthroughLighting({ walk, timeOfDay }) {
  const renderer = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  const sunRef = useRef(null)
  const hemiRef = useRef(null)
  const lampRefs = useRef([])
  const envRef = useRef(null)
  const level = useRef({ ...PRESETS.day, sunColor: new THREE.Color(PRESETS.day.sunColor) })

  useEffect(() => {
    const baked = bakeEnvironments(renderer)
    envRef.current = baked
    scene.environment = baked.textures.day
    scene.environmentIntensity = PRESETS.day.env
    return () => {
      scene.environment = null
      baked.dispose()
    }
  }, [renderer, scene])

  // Aim the sun through the front windows and wrap its shadow around the model.
  useEffect(() => {
    const sun = sunRef.current
    if (!sun || !walk) return
    const center = walk.bounds.getCenter(new THREE.Vector3())
    const size = walk.bounds.getSize(new THREE.Vector3())
    const reach = Math.max(size.x, size.z)

    sun.position.set(center.x - reach * 0.35, center.y + reach * 0.9, center.z - reach * 1.1)
    sun.target.position.copy(center)
    sun.target.updateMatrixWorld()

    const camera = sun.shadow.camera
    const extent = reach * 0.75
    camera.left = -extent
    camera.right = extent
    camera.top = extent
    camera.bottom = -extent
    camera.near = 0.5
    camera.far = reach * 4
    camera.updateProjectionMatrix()
  }, [walk])

  useEffect(() => {
    const target = PRESETS[timeOfDay]
    const from = { ...level.current, sunColor: level.current.sunColor.clone() }
    const toColor = new THREE.Color(target.sunColor)
    const proxy = { t: 0 }
    let swapped = false

    const apply = (t) => {
      const lerp = THREE.MathUtils.lerp
      const current = level.current
      current.sun = lerp(from.sun, target.sun, t)
      current.hemi = lerp(from.hemi, target.hemi, t)
      current.env = lerp(from.env, target.env, t)
      current.lamps = lerp(from.lamps, target.lamps, t)
      current.exposure = lerp(from.exposure, target.exposure, t)
      current.sunColor.lerpColors(from.sunColor, toColor, t)

      if (sunRef.current) {
        sunRef.current.intensity = current.sun
        sunRef.current.color.copy(current.sunColor)
      }
      if (hemiRef.current) hemiRef.current.intensity = current.hemi
      lampRefs.current.forEach((lamp, index) => {
        if (lamp) lamp.intensity = (walk?.lights[index]?.intensity ?? 12) * current.lamps
      })
      scene.environmentIntensity = current.env
      renderer.toneMappingExposure = current.exposure

      if (!swapped && t >= 0.5 && envRef.current) {
        swapped = true
        scene.environment = envRef.current.textures[timeOfDay]
      }
    }

    const tween = gsap.to(proxy, {
      t: 1,
      duration: 1.4,
      ease: 'power2.inOut',
      onUpdate: () => apply(proxy.t),
      onComplete: () => apply(1),
    })
    return () => tween.kill()
  }, [renderer, scene, timeOfDay, walk])

  return (
    <>
      <hemisphereLight ref={hemiRef} args={['#dfe8f2', '#8a7f72', PRESETS.day.hemi]} />
      <directionalLight
        ref={sunRef}
        castShadow
        intensity={PRESETS.day.sun}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      {(walk?.lights ?? []).map((light, index) => (
        <pointLight
          key={index}
          ref={(node) => {
            lampRefs.current[index] = node
          }}
          position={light.position}
          color={light.color}
          distance={light.distance}
          decay={2}
          intensity={0}
        />
      ))}
    </>
  )
}
