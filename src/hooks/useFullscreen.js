import { useCallback, useEffect, useState } from 'react'

export function useFullscreen(elementRef) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggle = useCallback(async () => {
    const element = elementRef.current ?? document.documentElement

    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await element.requestFullscreen()
    } catch {
      // Safari and locked-down browsers reject this; the viewer still works.
    }
  }, [elementRef])

  return { isFullscreen, toggle }
}
