import { createContext, useContext } from 'react'

/**
 * Project-level state: the project, its views, which one is showing, the
 * navigation history and the editor/showcase mode.
 *
 * Deliberately separate from the 3D viewer's store. That one owns what is true
 * *inside* a single 3D view (selected tower, camera focus, day/night,
 * inspector); this one owns what is true *across* views. Kept apart so neither
 * becomes one context that everything re-renders on.
 */
export const ExperienceContext = createContext(null)

export function useExperience() {
  const context = useContext(ExperienceContext)
  if (!context) throw new Error('useExperience must be used inside <ExperienceProvider>')
  return context
}

export const MODES = { EDITOR: 'editor', SHOWCASE: 'showcase' }
