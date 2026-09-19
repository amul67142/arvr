import { AlertIcon, ArrowIcon } from './Icons'

export default function ErrorState({ fileName, onRetry }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-neutral-950 px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_80%_at_50%_0%,#1b1b1b_0%,#0a0a0a_60%)]"
      />

      <div className="relative w-full max-w-lg text-center">
        <span className="inline-flex text-white/35">
          <AlertIcon size={26} />
        </span>

        <h1 className="display mt-8 text-4xl text-white md:text-5xl">
          Unable to load this 3D model.
        </h1>

        <p className="mx-auto mt-6 max-w-sm text-sm leading-relaxed text-white/45">
          The file may be corrupted or contain unsupported resources.
          {fileName ? (
            <>
              {' '}
              <span className="text-white/60">{fileName}</span>
            </>
          ) : null}
        </p>

        <p className="mx-auto mt-4 max-w-sm text-xs leading-relaxed text-white/30">
          If this is a .gltf file, its linked .bin and texture files may be missing.
          A single GLB file is the most reliable format.
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="label mx-auto mt-10 flex items-center gap-3 bg-white px-8 py-4 text-neutral-950 transition-colors duration-500 hover:bg-white/85"
        >
          Try Another Model
          <ArrowIcon size={15} />
        </button>
      </div>
    </div>
  )
}
