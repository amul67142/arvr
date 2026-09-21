/**
 * Turns user-selected files into session assets a renderer can consume.
 *
 * These are pure builders: they create object URLs and hand back both the
 * asset and the list of URLs it holds. They never revoke anything themselves —
 * ExperienceProvider is the single owner of every URL's lifetime, so there is
 * exactly one place where revocation can go wrong.
 *
 * Object URLs are created inside the user gesture, never in an effect: effects
 * run twice under StrictMode, and a revoked-then-recreated URL would hand the
 * GLTF loader a dead reference.
 */

let sequence = 0
const nextId = (prefix) => `${prefix}-${(sequence += 1)}`

function baseName(file) {
  const path = file.webkitRelativePath || file.name
  return path.split('/').pop().toLowerCase()
}

function extensionOf(file) {
  return file.name.split('.').pop()?.toLowerCase() ?? ''
}

/** Combined weight of a model and everything it references. */
export function totalBytes(file, companions = []) {
  return companions.reduce((sum, companion) => sum + companion.size, file.size)
}

/**
 * A 3D model source, in exactly the shape Phase 1's UploadedModel and
 * ProjectViewer already consume — this was lifted from the old
 * useUploadedModel hook so the 3D pipeline needs no changes.
 *
 * `companions` covers multi-file .gltf uploads: the .bin and textures get their
 * own blob URLs, keyed by filename so the loader can resolve the relative paths
 * baked into the .gltf.
 */
export function createModelSource(file, companions = []) {
  const urls = []

  const url = URL.createObjectURL(file)
  urls.push(url)

  const resources = new Map()
  companions.forEach((companion) => {
    const companionUrl = URL.createObjectURL(companion)
    urls.push(companionUrl)
    resources.set(baseName(companion), companionUrl)
  })

  return {
    urls,
    asset: {
      id: nextId('model'),
      kind: '3d',
      url,
      resources,
      name: file.name,
      // What the browser actually has to load. For a multi-file .gltf the
      // .gltf itself is a rounding error next to its textures.
      size: totalBytes(file, companions),
      fileSize: file.size,
      extension: extensionOf(file),
      companionCount: companions.length,
    },
  }
}

export function createImageSource(file) {
  const url = URL.createObjectURL(file)

  return {
    urls: [url],
    asset: {
      id: nextId('image'),
      kind: 'image',
      url,
      name: file.name,
      size: file.size,
      extension: extensionOf(file),
    },
  }
}

/**
 * From whatever the user selected, pick the file the view is actually about
 * and treat the rest as companions. For a 3D view a .glb wins over a .gltf and
 * everything else (.bin, textures) rides along; an image view takes the first
 * accepted image. Returns null if nothing usable was chosen.
 */
export function pickMainFile(typeId, files, isAccepted) {
  const list = Array.from(files ?? [])
  if (typeId === '3d' || typeId === 'walkthrough') {
    const main =
      list.find((file) => extensionOf(file) === 'glb') ??
      list.find((file) => extensionOf(file) === 'gltf')
    return main ? { file: main, companions: list.filter((file) => file !== main) } : null
  }

  const main = list.find((file) => isAccepted(typeId, file))
  return main ? { file: main, companions: [] } : null
}

/** Build the session asset for any supported view type. */
export function createAssetForType(typeId, file, companions = []) {
  if (typeId === '3d' || typeId === 'walkthrough') return createModelSource(file, companions)
  if (typeId === 'image') return createImageSource(file)
  throw new Error(`No asset builder for view type "${typeId}"`)
}

/**
 * The part of an asset that is safe to persist: a description of the file,
 * never the URL. A blob URL is meaningless after a reload, so storing one would
 * only let the app pretend a file is still there when it is not.
 */
export function describeAsset(asset) {
  if (!asset) return null
  return {
    fileName: asset.name,
    extension: asset.extension,
    size: asset.size,
    // Bundled demo files can be fetched again after a reload; uploads cannot.
    ...(asset.demoSrc ? { demoSrc: asset.demoSrc } : {}),
  }
}

/** Fetch a file the app itself ships (public/demo) as a File object. */
export async function fetchDemoFile(src) {
  const response = await fetch(src)
  if (!response.ok) throw new Error(`${response.status} ${src}`)
  const blob = await response.blob()
  return new File([blob], src.split('/').pop(), { type: blob.type })
}
