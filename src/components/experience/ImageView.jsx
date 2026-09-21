import { useState } from 'react'

import { AlertIcon } from '../common/Icons'

/**
 * Full-viewport image, aspect ratio preserved, never distorted.
 *
 * A plain <img object-fit: contain> would letterbox correctly but its box would
 * still fill the viewport, so anything positioned over it would drift away from
 * the actual picture as the window changes shape. Instead the image sits in a
 * frame sized to exactly the rendered image — computed with container query
 * units from the image's natural aspect ratio — and `children` are laid over
 * that frame.
 *
 * That frame is the coordinate space for future hotspots: position them in
 * percentages of the image and they stay pinned to the same spot on the
 * picture at any viewport size.
 */
export default function ImageView({ asset, alt, children }) {
  const [natural, setNatural] = useState(null) // { width, height, src }
  const [failedSrc, setFailedSrc] = useState(null)

  // Derived rather than reset in an effect: a new asset simply doesn't match
  // what was measured for the old one.
  const measured = natural && natural.src === asset.url ? natural : null
  const failed = failedSrc === asset.url

  const ratio = measured ? measured.width / measured.height : null

  return (
    <div className="relative h-full w-full overflow-hidden bg-neutral-950">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,#1f1f1f_0%,#0c0c0c_55%,#060606_100%)]"
      />

      <div className="absolute inset-0 px-5 pt-24 pb-10 md:px-12 md:pt-28 md:pb-14">
        <div className="grid h-full w-full place-items-center [container-type:size]">
          <div
            data-image-frame
            className="relative transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={
              ratio
                ? {
                    aspectRatio: `${measured.width} / ${measured.height}`,
                    width: `min(100cqw, calc(100cqh * ${ratio}))`,
                    opacity: 1,
                  }
                : { width: 0, height: 0, opacity: 0 }
            }
          >
            <img
              key={asset.url}
              src={asset.url}
              alt={alt}
              draggable={false}
              onLoad={(event) =>
                setNatural({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                  src: asset.url,
                })
              }
              onError={() => setFailedSrc(asset.url)}
              className="absolute inset-0 block h-full w-full object-contain shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)] select-none"
            />

            {/* Hotspot layer — same box as the rendered image. */}
            <div data-hotspot-layer className="absolute inset-0">
              {children}
            </div>
          </div>
        </div>
      </div>

      {failed ? (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <div>
            <span className="inline-flex text-white/35">
              <AlertIcon size={24} />
            </span>
            <p className="mt-5 text-sm text-white/70">This image could not be displayed.</p>
            <p className="mt-2 text-xs text-white/35">{asset.name}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
