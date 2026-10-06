import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Copy to the clipboard, remembering which block was copied so the button can
 * say so for a moment. Falls back to a hidden textarea where the async
 * clipboard is blocked (http origins, older Safari).
 */
export function useCopy(duration = 1800) {
  const [copied, setCopied] = useState(null)
  const timer = useRef(0)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(
    async (key, text) => {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        const field = document.createElement('textarea')
        field.value = text
        field.style.position = 'fixed'
        field.style.opacity = '0'
        document.body.append(field)
        field.select()
        try {
          document.execCommand('copy')
        } catch {
          field.remove()
          return
        }
        field.remove()
      }
      setCopied(key)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), duration)
    },
    [duration],
  )

  return { copy, copied }
}
