import { useMemo, useState } from 'react'

import { embedSnippet, embedUrl } from '../../experience/embed'
import { DEMO_PROJECTS } from '../../experience/demoProjects'
import { useExperience } from '../../experience/experienceStore'
import { useCopy } from '../../hooks/useCopy'
import { CloseIcon } from '../common/Icons'

const SIZES = [
  { id: '16:9', label: 'Widescreen', hint: 'Scales with the column', aspect: '16 / 9' },
  { id: '4:3', label: 'Compact', hint: 'Taller on phones', aspect: '4 / 3' },
  { id: 'fixed', label: 'Fixed height', hint: '720 px tall', height: 720 },
]

const LISTENER = `window.addEventListener('message', (event) => {
  if (event.data?.source !== 'arvr-embed') return
  // { type: 'ready' | 'view', viewId, viewType, title, subtitle }
  console.log(event.data)
})`

/** One copyable block of code. */
function CodeBlock({ label, value, onCopy, copied }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="label text-white/40">{label}</p>
        <button
          type="button"
          onClick={onCopy}
          className="label text-white/50 transition-colors duration-300 hover:text-white"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="scroll-thin mt-3 overflow-x-auto border border-white/10 bg-black/30 px-4 py-3.5 text-[12px] leading-relaxed whitespace-pre text-white/70">
        {value}
      </pre>
    </div>
  )
}

/**
 * How this project goes on the client's own website: one iframe, a link to
 * test it, and the events the page can listen for.
 *
 * Only a published project can be embedded — one whose files ship in
 * public/demo. An uploaded file is a blob URL that dies with the tab, so there
 * would be nothing for a visitor's browser to fetch.
 */
export default function EmbedDialog({ onClose }) {
  const { project, views, assets } = useExperience()
  const demoId = useMemo(
    () => Object.keys(DEMO_PROJECTS).find((key) => DEMO_PROJECTS[key].project.id === project.id),
    [project.id],
  )

  const [view, setView] = useState(project.startViewId ?? '')
  const [brand, setBrand] = useState(true)
  const [size, setSize] = useState(SIZES[0])
  const { copy, copied } = useCopy()

  const origin = window.location.origin
  const url = embedUrl({
    origin,
    path: window.location.pathname,
    demo: demoId ?? 'your-project',
    view: view === project.startViewId ? null : view,
    brand,
  })
  const snippet = embedSnippet({
    url,
    title: `${project.name} — virtual tour`,
    aspect: size.aspect,
    height: size.height,
  })

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6" onClick={onClose}>
      <div
        className="glass view-enter flex max-h-[88vh] w-full max-w-2xl flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between px-8 pt-8 pb-6">
          <div>
            <p className="label text-white/40">Embed</p>
            <h2 className="display mt-3 text-3xl text-white">{project.name} on your website</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="ctrl -mr-2 px-3">
            <CloseIcon size={16} />
          </button>
        </header>
        <div className="hairline mx-8 h-px" />

        <div className="scroll-thin min-h-0 flex-1 space-y-8 overflow-y-auto px-8 py-7">
          {demoId ? null : (
            <p className="border border-amber-200/25 bg-amber-200/[0.06] px-5 py-4 text-[13px] leading-relaxed text-amber-100/75">
              This project&rsquo;s files were uploaded in this browser, so a website cannot fetch
              them. Publish it first — put the files in <code>public/demo</code>, add the project to{' '}
              <code>src/experience/demoProjects.js</code>, then rebuild. The code below shows the
              shape it will take.
            </p>
          )}

          <section>
            <p className="label text-white/40">Opens on</p>
            <select
              value={view}
              aria-label="View the embed opens on"
              onChange={(event) => setView(event.target.value)}
              className="mt-3 w-full cursor-pointer border border-white/12 bg-neutral-900 px-4 py-3 text-[13px] font-light text-white/80 outline-none transition-colors duration-300 hover:border-white/25 focus:border-white/40"
            >
              {views.map((candidate) => (
                <option key={candidate.id} value={candidate.id} disabled={!assets[candidate.id]}>
                  {candidate.name}
                  {candidate.id === project.startViewId ? ' (start)' : ''}
                </option>
              ))}
            </select>
          </section>

          <section>
            <p className="label text-white/40">Frame size</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {SIZES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  data-active={size.id === option.id}
                  onClick={() => setSize(option)}
                  className="border border-white/12 px-3 py-3 text-left transition-colors duration-300 hover:border-white/30 data-[active=true]:border-white/55 data-[active=true]:bg-white/[0.07]"
                >
                  <span className="block text-[13px] font-light text-white/85">{option.label}</span>
                  <span className="mt-1 block text-[11px] text-white/35">{option.hint}</span>
                </button>
              ))}
            </div>
          </section>

          <label className="flex cursor-pointer items-center gap-3 text-[13px] font-light text-white/75">
            <input
              type="checkbox"
              checked={brand}
              onChange={(event) => setBrand(event.target.checked)}
              className="size-4 accent-white"
            />
            Show the project name inside the frame
          </label>

          <CodeBlock
            label="Paste into the page"
            value={snippet}
            onCopy={() => copy('snippet', snippet)}
            copied={copied === 'snippet'}
          />

          <CodeBlock
            label="Follow what the visitor opens"
            value={LISTENER}
            onCopy={() => copy('events', LISTENER)}
            copied={copied === 'events'}
          />

          <section>
            <p className="label text-white/40">Before it goes live</p>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-white/55">
              <li>
                The address above is <span className="text-white/80">{origin}</span> — this machine.
                Build the app, host the <code>dist</code> folder, and swap in that address.
              </li>
              <li>Serve it over https, or browsers block fullscreen and the motion sensors.</li>
              <li>
                The tour is hundreds of megabytes of renders and models, so put a CDN in front of
                it.
              </li>
            </ul>
          </section>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-white/10 px-8 py-6">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="label text-white/50 transition-colors duration-300 hover:text-white"
          >
            Open the embed in a new tab
          </a>
          <button
            type="button"
            onClick={() => copy('snippet', snippet)}
            className="label bg-white px-6 py-3.5 text-neutral-950 transition-colors duration-500 hover:bg-white/85"
          >
            {copied === 'snippet' ? 'Copied' : 'Copy embed code'}
          </button>
        </footer>
      </div>
    </div>
  )
}
