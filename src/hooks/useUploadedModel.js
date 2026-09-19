import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Owns the lifetime of every blob URL in the app.
 *
 * Object URLs are created inside the user gesture rather than in an effect:
 * effects run twice under StrictMode, and a revoked-then-recreated URL would
 * hand the GLTF loader a dead reference.
 */

let sequence = 0

function baseName(file) {
  const path = file.webkitRelativePath || file.name
  return path.split('/').pop().toLowerCase()
}

/** Combined weight of a model and everything it references. */
export function totalBytes(file, companions = []) {
  return companions.reduce((sum, companion) => sum + companion.size, file.size)
}

export function useUploadedModel() {
  const [source, setSource] = useState(null)
  const activeUrls = useRef([])

  const release = useCallback(() => {
    activeUrls.current.forEach((url) => URL.revokeObjectURL(url))
    activeUrls.current = []
  }, [])

  /**
   * `companions` covers multi-file .gltf uploads: the .bin and textures get
   * their own blob URLs, keyed by filename so the loader can resolve the
   * relative paths baked into the .gltf.
   */
  const open = useCallback(
    (file, companions = []) => {
      release()

      const mainUrl = URL.createObjectURL(file)
      activeUrls.current.push(mainUrl)

      const resources = new Map()
      companions.forEach((companion) => {
        const url = URL.createObjectURL(companion)
        activeUrls.current.push(url)
        resources.set(baseName(companion), url)
      })

      sequence += 1
      setSource({
        id: `model-${sequence}`,
        url: mainUrl,
        resources,
        name: file.name,
        // What the browser actually has to load. For a multi-file .gltf the
        // .gltf itself is a rounding error next to its textures, so reporting
        // only its size would be misleading.
        size: totalBytes(file, companions),
        fileSize: file.size,
        extension: file.name.split('.').pop().toLowerCase(),
        companionCount: companions.length,
      })
    },
    [release],
  )

  const close = useCallback(() => {
    release()
    setSource(null)
  }, [release])

  useEffect(() => release, [release])

  return { source, open, close }
}
