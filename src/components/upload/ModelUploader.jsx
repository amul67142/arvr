import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

import { totalBytes } from '../../hooks/useUploadedModel'
import { formatBytes } from '../../utils/modelUtils'
import { AlertIcon, ArrowIcon, CloseIcon, CubeIcon, UploadIcon } from '../common/Icons'

const SIZE_HINT_BYTES = 50 * 1024 * 1024

function extensionOf(file) {
  return file.name.split('.').pop()?.toLowerCase() ?? ''
}

/** Recursively read a dropped folder, so multi-file .gltf projects work. */
async function readEntry(entry, out) {
  if (entry.isFile) {
    const file = await new Promise((resolve) => entry.file(resolve, () => resolve(null)))
    if (file) out.push(file)
    return
  }

  if (entry.isDirectory) {
    const reader = entry.createReader()
    const batch = await new Promise((resolve) =>
      reader.readEntries(resolve, () => resolve([])),
    )
    for (const child of batch) await readEntry(child, out)
  }
}

async function filesFromDrop(dataTransfer) {
  const entries = Array.from(dataTransfer.items ?? [])
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean)

  if (entries.length === 0) return Array.from(dataTransfer.files ?? [])

  const collected = []
  for (const entry of entries) await readEntry(entry, collected)
  return collected.length > 0 ? collected : Array.from(dataTransfer.files ?? [])
}

export default function ModelUploader({ onSelect, notice }) {
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const dragDepth = useRef(0)

  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState(null)
  const [staged, setStaged] = useState(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('[data-reveal]', {
        y: 22,
        opacity: 0,
        duration: 1.1,
        ease: 'power3.out',
        stagger: 0.09,
        delay: 0.1,
      })
    }, rootRef)

    return () => ctx.revert()
  }, [])

  const stageFiles = useCallback((files) => {
    const list = Array.from(files ?? [])
    if (list.length === 0) return

    const model =
      list.find((file) => extensionOf(file) === 'glb') ??
      list.find((file) => extensionOf(file) === 'gltf')

    if (!model) {
      setStaged(null)
      setError({
        title: 'Unsupported file format.',
        body: 'Please upload a GLB or GLTF model.',
      })
      return
    }

    setError(null)
    setStaged({ file: model, companions: list.filter((file) => file !== model) })
  }, [])

  const handleDrop = useCallback(
    async (event) => {
      event.preventDefault()
      dragDepth.current = 0
      setIsDragging(false)
      stageFiles(await filesFromDrop(event.dataTransfer))
    },
    [stageFiles],
  )

  const handleDragEnter = useCallback((event) => {
    event.preventDefault()
    dragDepth.current += 1
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((event) => {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }, [])

  const launch = useCallback(() => {
    if (staged) onSelect(staged.file, staged.companions)
  }, [onSelect, staged])

  // Judge weight by the whole payload, not just the .gltf manifest.
  const stagedBytes = staged ? totalBytes(staged.file, staged.companions) : 0
  const isOversized = stagedBytes > SIZE_HINT_BYTES
  const isGltf = staged ? extensionOf(staged.file) === 'gltf' : false

  return (
    <div
      ref={rootRef}
      className="relative flex min-h-full w-full flex-col overflow-y-auto bg-neutral-950 text-neutral-200"
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,#1e1e1e_0%,#0a0a0a_58%,#050505_100%)]"
      />

      <header
        data-reveal
        className="relative z-10 flex items-center justify-between px-8 py-7 md:px-14"
      >
        <div className="flex items-center gap-3 text-white/85">
          <CubeIcon size={18} />
          <span className="label-lg">Interactive Real Estate Experience</span>
        </div>
        <span className="label hidden text-white/35 md:block">
          Phase 01 · Project Preview
        </span>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 pb-16 md:px-10">
        <div data-reveal className="mb-10 md:mb-14">
          <h1 className="display text-5xl text-white md:text-[4.25rem]">
            Upload your
            <br />
            <span className="italic text-white/70">project model</span>
          </h1>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-white/45">
            Everything runs locally in this browser. Your model is never uploaded,
            stored or sent anywhere.
          </p>
        </div>

        {notice ? (
          <div
            data-reveal
            className="mb-6 flex items-start gap-3 border border-white/10 bg-white/[0.03] px-5 py-4 text-sm text-white/60"
          >
            <span className="mt-0.5 text-white/40">
              <AlertIcon size={15} />
            </span>
            <span>{notice}</span>
          </div>
        ) : null}

        <div
          data-reveal
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          data-dragging={isDragging}
          className="group relative flex min-h-[260px] flex-col items-center justify-center gap-6 border border-dashed border-white/15 bg-white/[0.02] px-8 py-14 text-center transition-[border-color,background-color] duration-500 data-[dragging=true]:border-white/45 data-[dragging=true]:bg-white/[0.06]"
        >
          <span className="text-white/30 transition-colors duration-500 group-hover:text-white/55">
            <UploadIcon size={30} />
          </span>

          <div className="space-y-2">
            <p className="label-lg text-white/70">Drag &amp; Drop GLB / GLTF</p>
            <p className="text-xs tracking-widest text-white/25">or</p>
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="label border border-white/20 bg-white px-7 py-3.5 text-neutral-950 transition-colors duration-500 hover:bg-white/85"
          >
            Choose 3D Model
          </button>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            className="hidden"
            onChange={(event) => {
              stageFiles(event.target.files)
              event.target.value = ''
            }}
          />
        </div>

        {error ? (
          <div className="mt-5 flex items-start gap-3 border border-red-400/25 bg-red-400/[0.06] px-5 py-4">
            <span className="mt-0.5 text-red-300/80">
              <AlertIcon size={15} />
            </span>
            <div className="text-sm">
              <p className="text-red-200/90">{error.title}</p>
              <p className="mt-1 text-white/45">{error.body}</p>
            </div>
          </div>
        ) : null}

        {staged ? (
          <div className="mt-5 border border-white/12 bg-white/[0.04] px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="label border border-white/20 px-2 py-1 text-white/55">
                    {extensionOf(staged.file).toUpperCase()}
                  </span>
                  <p className="truncate text-sm text-white/85">{staged.file.name}</p>
                </div>
                <p className="mt-2 text-xs text-white/40">
                  {formatBytes(stagedBytes)}
                  {staged.companions.length > 0
                    ? ` · ${staged.companions.length} linked file${
                        staged.companions.length === 1 ? '' : 's'
                      }`
                    : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStaged(null)}
                  aria-label="Remove selected file"
                  className="ctrl px-3"
                >
                  <CloseIcon size={15} />
                </button>
                <button
                  type="button"
                  onClick={launch}
                  className="label flex items-center gap-3 bg-white px-7 py-3.5 text-neutral-950 transition-colors duration-500 hover:bg-white/85"
                >
                  Launch Experience
                  <ArrowIcon size={15} />
                </button>
              </div>
            </div>

            {isOversized ? (
              <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-relaxed text-amber-200/65">
                This model totals {formatBytes(stagedBytes)}. For smoother performance,
                use optimized GLB models under 50 MB.
              </p>
            ) : null}

            {isGltf && staged.companions.length === 0 ? (
              <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-relaxed text-white/45">
                A .gltf file usually references external .bin and texture files. Drop the
                whole folder to include them — or use GLB, which packs everything into one
                file.
              </p>
            ) : null}
          </div>
        ) : null}

        <div
          data-reveal
          className="mt-10 grid gap-6 border-t border-white/10 pt-8 text-xs text-white/35 sm:grid-cols-2"
        >
          <div>
            <p className="label mb-3 text-white/45">Supported</p>
            <p className="leading-relaxed">
              .glb <span className="text-white/25">— recommended, single file</span>
              <br />
              .gltf <span className="text-white/25">— include linked resources</span>
            </p>
          </div>
          <div>
            <p className="label mb-3 text-white/45">Recommended</p>
            <p className="leading-relaxed">
              For smoother performance, use optimized GLB models under 50 MB.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
