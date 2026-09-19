// Three.js objects from useThree are long-lived scene graph nodes; driving them
// imperatively is the point of this component, so the immutability rule does
// not apply here.
/* oxlint-disable react/immutability */
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'

import { useViewer } from '../../state/viewerStore'
import { TIME_OF_DAY, applyPageGradient, bakeEnvironments } from '../../utils/envUtils'

const TRANSITION_DURATION = 1.6

/** Mutable snapshot of the currently displayed lighting, tweened by GSAP. */
function snapshotOf(preset) {
  return {
    sunIntensity: preset.sunIntensity,
    ambientIntensity: preset.ambientIntensity,
    hemiIntensity: preset.hemiIntensity,
    envIntensity: preset.envIntensity,
    shadowOpacity: preset.shadowOpacity,
    sunColor: new THREE.Color(preset.sunColor),
    ambientColor: new THREE.Color(preset.ambientColor),
    hemiSky: new THREE.Color(preset.hemiSky),
    hemiGround: new THREE.Color(preset.hemiGround),
    pageTop: new THREE.Color(preset.pageTop),
    pageBottom: new THREE.Color(preset.pageBottom),
    sunElevation: preset.sunElevation,
    sunAzimuth: preset.sunAzimuth,
  }
}

export default function LightingController({ shadowsEnabled }) {
  const renderer = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const { timeOfDay, model } = useViewer()

  const sunRef = useRef(null)
  const ambientRef = useRef(null)
  const hemiRef = useRef(null)

  const environments = useRef(null)
  const live = useRef(snapshotOf(TIME_OF_DAY.day))
  const initialMode = useRef(timeOfDay)

  const radius = model?.bounds.radius ?? 20

  // Bake both environment maps once. Swapping modes is then a texture swap.
  useEffect(() => {
    const baked = bakeEnvironments(renderer)
    environments.current = baked

    scene.environment = baked.textures[initialMode.current]
    scene.environmentIntensity = TIME_OF_DAY[initialMode.current].envIntensity

    return () => {
      scene.environment = null
      baked.dispose()
      environments.current = null
    }
  }, [renderer, scene])

  // Crossfade every lighting value; swap the environment map at the dip, where
  // it is least visible.
  useEffect(() => {
    const preset = TIME_OF_DAY[timeOfDay]
    const from = snapshotOf(live.current)
    const to = snapshotOf(preset)
    const proxy = { t: 0 }
    let swapped = false

    const write = (t) => {
      const current = live.current
      const lerp = THREE.MathUtils.lerp

      current.sunIntensity = lerp(from.sunIntensity, to.sunIntensity, t)
      current.ambientIntensity = lerp(from.ambientIntensity, to.ambientIntensity, t)
      current.hemiIntensity = lerp(from.hemiIntensity, to.hemiIntensity, t)
      current.envIntensity = lerp(from.envIntensity, to.envIntensity, t)
      current.shadowOpacity = lerp(from.shadowOpacity, to.shadowOpacity, t)
      current.sunElevation = lerp(from.sunElevation, to.sunElevation, t)
      current.sunAzimuth = lerp(from.sunAzimuth, to.sunAzimuth, t)

      current.sunColor.lerpColors(from.sunColor, to.sunColor, t)
      current.ambientColor.lerpColors(from.ambientColor, to.ambientColor, t)
      current.hemiSky.lerpColors(from.hemiSky, to.hemiSky, t)
      current.hemiGround.lerpColors(from.hemiGround, to.hemiGround, t)
      current.pageTop.lerpColors(from.pageTop, to.pageTop, t)
      current.pageBottom.lerpColors(from.pageBottom, to.pageBottom, t)

      if (sunRef.current) {
        sunRef.current.intensity = current.sunIntensity
        sunRef.current.color.copy(current.sunColor)
        sunRef.current.position.set(
          Math.cos(current.sunAzimuth) * radius * 2.2,
          radius * 2.4 * current.sunElevation + radius * 0.6,
          Math.sin(current.sunAzimuth) * radius * 2.2,
        )
      }

      if (ambientRef.current) {
        ambientRef.current.intensity = current.ambientIntensity
        ambientRef.current.color.copy(current.ambientColor)
      }

      if (hemiRef.current) {
        hemiRef.current.intensity = current.hemiIntensity
        hemiRef.current.color.copy(current.hemiSky)
        hemiRef.current.groundColor.copy(current.hemiGround)
      }

      // Dip the reflections through the middle of the transition so the
      // environment swap lands where the eye is least likely to catch it.
      scene.environmentIntensity =
        current.envIntensity * (1 - 0.6 * Math.sin(t * Math.PI))

      if (!swapped && t >= 0.5) {
        swapped = true
        const textures = environments.current?.textures
        if (textures) scene.environment = textures[timeOfDay]
      }

      applyPageGradient(
        `#${current.pageTop.getHexString()}`,
        `#${current.pageBottom.getHexString()}`,
      )
    }

    const tween = gsap.to(proxy, {
      t: 1,
      duration: TRANSITION_DURATION,
      ease: 'power2.inOut',
      onUpdate: () => write(proxy.t),
      onComplete: () => write(1),
    })

    return () => tween.kill()
  }, [radius, scene, timeOfDay])

  // Keep the shadow frustum wrapped tightly around the project.
  useEffect(() => {
    const sun = sunRef.current
    if (!sun || !model) return

    const extent = model.bounds.radius * 1.35
    const shadow = sun.shadow.camera
    shadow.left = -extent
    shadow.right = extent
    shadow.top = extent
    shadow.bottom = -extent
    shadow.near = model.bounds.radius * 0.1
    shadow.far = model.bounds.radius * 8
    shadow.updateProjectionMatrix()

    sun.target.position.copy(model.bounds.center)
    sun.target.updateMatrixWorld()
  }, [model])

  return (
    <>
      {/* Initial values only — the transition tween takes over on mount. */}
      <ambientLight ref={ambientRef} intensity={TIME_OF_DAY.day.ambientIntensity} />
      <hemisphereLight ref={hemiRef} intensity={TIME_OF_DAY.day.hemiIntensity} />
      <directionalLight
        ref={sunRef}
        castShadow={shadowsEnabled}
        intensity={TIME_OF_DAY.day.sunIntensity}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />
    </>
  )
}
