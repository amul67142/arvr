/**
 * Embedding: the same experience, running inside someone else's website.
 *
 * A host page carries one <iframe> pointing at this app with `?embed=<demo>`.
 * That URL boots straight into the customer-facing experience — no editor, no
 * upload screen, no "Exit Preview" — and nothing is read from or written to
 * localStorage, so an embed can never disturb a project the same browser is
 * editing in another tab.
 *
 * Only projects whose files ship with the app (public/demo, listed in
 * demoProjects.js) can be embedded. An uploaded file lives as a blob URL in
 * one tab and is gone on the next load, so there is nothing for an embed to
 * fetch — the project has to be published with the build first.
 */

/** Marks every message this app posts to its host page. */
export const EMBED_SOURCE = 'arvr-embed'

/** The embed request in a URL, or null when the app was opened normally. */
export function readEmbedConfig(search = window.location.search) {
  const params = new URLSearchParams(search)
  const demo = params.get('embed')
  if (!demo) return null
  return {
    demo,
    view: params.get('view') || null, // which view to open on
    brand: params.get('brand') !== '0', // the project-name plate, top left
  }
}

/** The URL a host page should point its iframe at. */
export function embedUrl({ origin, path = '/', demo, view, brand = true }) {
  const params = new URLSearchParams({ embed: demo })
  if (view) params.set('view', view)
  if (!brand) params.set('brand', '0')
  return `${origin}${path}?${params}`
}

/**
 * The snippet to paste into a page. Responsive by aspect ratio when given
 * one, otherwise a fixed height — both keep the iframe full width.
 */
export function embedSnippet({ url, title = 'Virtual tour', aspect = '16 / 9', height = null }) {
  const box = height ? `width:100%;height:${height}px;border:0` : `width:100%;aspect-ratio:${aspect};border:0`
  return [
    `<iframe`,
    `  src="${url}"`,
    `  title="${title}"`,
    `  style="${box}"`,
    `  loading="lazy"`,
    `  allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope"`,
    `  allowfullscreen`,
    `></iframe>`,
  ].join('\n')
}

/**
 * Tell the host page what the visitor is doing: which view opened, which home
 * was shortlisted. The site can listen for these and open its own enquiry
 * form — that is how a booking gets captured without this app owning one.
 *
 * Only view ids and labels travel; no personal data, so '*' is safe as the
 * target origin and the embed works on any domain without configuration.
 */
export function postEmbedEvent(type, payload = {}) {
  if (typeof window === 'undefined' || window.parent === window) return
  try {
    window.parent.postMessage({ source: EMBED_SOURCE, type, ...payload }, '*')
  } catch {
    // A host that refuses messages is not a reason to break the tour.
  }
}
