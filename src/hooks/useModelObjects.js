import { useMemo } from 'react'

import {
  buildHierarchy,
  configureShadows,
  detectSelectableObjects,
  getModelBounds,
  getSceneStats,
  setInteractiveSubtree,
} from '../utils/modelUtils'

/**
 * One traversal pass per loaded model, memoised on the scene reference.
 * Everything downstream (inspector tree, tower list, camera fit, stats) reads
 * from this single result rather than walking the graph again.
 */
export function useModelObjects(scene) {
  return useMemo(() => {
    if (!scene) return null

    const towers = detectSelectableObjects(scene)
    const stats = getSceneStats(scene)
    const bounds = getModelBounds(scene)
    const { tree, truncated } = buildHierarchy(scene)

    setInteractiveSubtree(scene, towers)
    const shadowsEnabled = configureShadows(scene, stats.meshes)

    if (import.meta.env.DEV) {
      console.groupCollapsed(
        `[viewer] model loaded — ${stats.objects} objects, ${towers.length} selectable`,
      )
      console.table(towers.map(({ name }) => ({ name })))
      console.log('stats', stats)
      console.log('bounds', {
        width: bounds.size.x,
        height: bounds.size.y,
        depth: bounds.size.z,
      })
      console.groupEnd()
    }

    return { scene, towers, stats, bounds, tree, treeTruncated: truncated, shadowsEnabled }
  }, [scene])
}
