/**
 * Temporary persistence: project metadata in localStorage, nothing else.
 *
 * What is saved: project name and id, view ids / names / types, a description
 * of each view's file, and tower → view target relationships.
 *
 * What is deliberately NOT saved: the files themselves, or their blob URLs. A
 * blob URL dies with the page, so after a refresh every view comes back as
 * metadata that needs its file re-attached. The editor says so plainly rather
 * than pretending the asset survived.
 *
 * localStorage can be unavailable (private windows, blocked site data) or hold
 * something unreadable, so every access is guarded and failure falls back to a
 * fresh start instead of an error.
 */

const STORAGE_KEY = 'arvr.experience.v1'
const VERSION = 1

export function loadProject() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const data = JSON.parse(raw)
    if (data?.version !== VERSION || !data.project || !Array.isArray(data.views)) {
      return null
    }

    return {
      project: data.project,
      views: data.views,
      towerTargets: data.towerTargets ?? {},
      unitTypeTargets: data.unitTypeTargets ?? {},
    }
  } catch {
    return null
  }
}

export function saveProject({ project, views, towerTargets, unitTypeTargets }) {
  try {
    const payload = {
      version: VERSION,
      savedAt: new Date().toISOString(),
      project,
      // Views are stored as-is because they already hold only metadata; the
      // session asset lives in a separate slice that never reaches here.
      views: views.map(({ id, name, type, asset }) => ({ id, name, type, asset })),
      towerTargets,
      unitTypeTargets,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Storage full or blocked. The session keeps working; it just won't be
    // remembered, which is the correct degradation for temporary persistence.
  }
}

export function clearProject() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do.
  }
}
