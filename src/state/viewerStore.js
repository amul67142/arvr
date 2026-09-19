import { createContext, useContext } from 'react'

/**
 * The viewer's shared state. Kept apart from the provider component so that
 * every consumer can import the hook without dragging a component import along
 * with it (and so Fast Refresh keeps working on the provider).
 */
export const ViewerContext = createContext(null)

export function useViewer() {
  const context = useContext(ViewerContext)
  if (!context) throw new Error('useViewer must be used inside <ViewerProvider>')
  return context
}
