import { useEffect, useRef, useState } from 'react'

import { postEmbedEvent } from '../../experience/embed'
import { DEMO_PROJECTS } from '../../experience/demoProjects'
import { MODES, useExperience } from '../../experience/experienceStore'
import ExperienceViewer from '../experience/ExperienceViewer'

/**
 * The app as a website embed: one project, opened straight into the
 * customer-facing experience.
 *
 * Everything the editor adds — sidebar, upload screen, Exit Preview — is
 * simply not rendered here, so there is no chrome to hide and no way for a
 * visitor to reach the authoring side.
 */
export default function EmbedApp({ config }) {
  const { project, currentView, currentParams, loadDemoProject, setMode, selectView } =
    useExperience()
  const demo = DEMO_PROJECTS[config.demo] ?? null
  const [failure, setFailure] = useState(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !demo) return
    started.current = true

    loadDemoProject(config.demo)
      .then(() => {
        setMode(MODES.SHOWCASE)
        // An explicit start view, when it is one this project actually has.
        if (config.view && demo.views.some((view) => view.id === config.view)) {
          selectView(config.view)
        }
        postEmbedEvent('ready', { project: demo.project.id, title: demo.title })
      })
      .catch((reason) => setFailure(String(reason?.message ?? reason)))
  }, [config, demo, loadDemoProject, selectView, setMode])

  // Let the host page follow the visit: which view they are in, and what it
  // is called ("Home 18B · 3 BHK" once they are inside a home).
  useEffect(() => {
    if (!currentView) return
    postEmbedEvent('view', {
      viewId: currentView.id,
      viewType: currentView.type,
      title: currentParams?.title ?? currentView.name,
      subtitle: currentParams?.subtitle ?? null,
    })
  }, [currentView, currentParams])

  const error = demo ? failure : `No project called "${config.demo}" is published with this app.`

  if (error) {
    return (
      <div className="grid h-full w-full place-items-center bg-neutral-950 px-6 text-center">
        <div>
          <p className="label text-white/40">Tour unavailable</p>
          <p className="mt-4 text-sm text-white/60">{error}</p>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="grid h-full w-full place-items-center bg-neutral-950">
        <p className="label text-white/45">Loading…</p>
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <ExperienceViewer />
    </div>
  )
}
