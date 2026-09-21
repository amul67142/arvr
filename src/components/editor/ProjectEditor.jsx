import { useCallback, useState } from 'react'

import { MODES, useExperience } from '../../experience/experienceStore'
import { CloseIcon } from '../common/Icons'
import ExperienceViewer from '../experience/ExperienceViewer'
import AddViewModal from './AddViewModal'
import ViewsSidebar from './ViewsSidebar'

/**
 * The two faces of a project.
 *
 *   EDITOR    sidebar + a live preview of the selected view
 *   SHOWCASE  the customer-facing experience, full-bleed, with every editing
 *             and debug control removed
 *
 * Both render the same ExperienceViewer, so what the editor previews is exactly
 * what a buyer will see — there is no second, drifting implementation.
 */
export default function ProjectEditor() {
  const { mode, setMode } = useExperience()
  const [addOpen, setAddOpen] = useState(false)
  const isEditor = mode === MODES.EDITOR

  const closeAdd = useCallback(() => setAddOpen(false), [])

  return (
    <div className="flex h-full w-full bg-neutral-950">
      {isEditor ? <ViewsSidebar onAddView={() => setAddOpen(true)} /> : null}

      <main className="relative min-w-0 flex-1">
        <ExperienceViewer />

        {/* Layered below the tower info panel (z-30): when the panel slides in
            it covers this, so the panel's own close button is never hidden. */}
        {!isEditor ? (
          <button
            type="button"
            onClick={() => setMode(MODES.EDITOR)}
            className="glass ctrl absolute top-6 right-6 z-20 px-5 py-3.5 md:top-8 md:right-8"
          >
            <CloseIcon size={14} />
            <span className="label">Exit Preview</span>
          </button>
        ) : null}
      </main>

      {/* Mounted only while open, so every visit starts from a clean form. */}
      {addOpen ? <AddViewModal open onClose={closeAdd} /> : null}
    </div>
  )
}
