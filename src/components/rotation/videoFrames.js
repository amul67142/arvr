/**
 * Split an orbit video into still frames in the browser — what an upload
 * of drone footage or a render animation needs before it can be turned by
 * dragging. Seeks evenly through the clip and encodes each frame as a JPEG
 * blob (far lighter in memory than keeping decoded bitmaps).
 *
 * `loop: true` treats the clip as exactly one turn: frames sit at i/count of
 * the duration, so the last one is a step short of the first and every step
 * is the same angle (360°/count) — what drawing flats onto it relies on.
 */
export async function extractVideoFrames(
  url,
  { count = 96, width = 1280, quality = 0.85, loop = false, onProgress = null } = {},
) {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve
    video.onerror = () => reject(new Error('This video could not be read by the browser.'))
  })

  const height = Math.round((width * video.videoHeight) / video.videoWidth)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const urls = []
  const seek = (time) =>
    new Promise((resolve) => {
      video.onseeked = resolve
      video.currentTime = time
    })

  // Stay just inside the clip: the very last timestamp often has no frame.
  const span = Math.max(0, video.duration - 0.05)
  for (let i = 0; i < count; i++) {
    // Mid-step, so float rounding never lands on the frame before.
    await seek(loop ? (video.duration * (i + 0.5)) / count : (span * i) / (count - 1))
    ctx.drawImage(video, 0, 0, width, height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    urls.push(URL.createObjectURL(blob))
    onProgress?.((i + 1) / count)
  }
  video.removeAttribute('src')
  video.load()

  return { urls, duration: video.duration, dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)) }
}
