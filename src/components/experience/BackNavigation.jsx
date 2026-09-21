import { useExperience } from '../../experience/experienceStore'
import { ArrowIcon } from '../common/Icons'

/**
 * Wayfinding for the experience: where you are, and the way back.
 *
 * Sits top-left over every view type, so a buyer always has the same anchor
 * whether they are orbiting a masterplan or looking at a render. The Back
 * button only appears once there is somewhere to go back to.
 */
export default function BackNavigation() {
  const { project, currentView, currentParams, canGoBack, goBack, history, views } =
    useExperience()

  if (!project || !currentView) return null

  const lastEntry = canGoBack ? history[history.length - 1] : null
  const previous = lastEntry
    ? { name: lastEntry.params?.title ?? views.find((view) => view.id === lastEntry.id)?.name }
    : null

  return (
    <nav className="pointer-events-none absolute top-0 left-0 z-20 flex items-start gap-2 p-6 md:p-8">
      {canGoBack ? (
        <button
          type="button"
          onClick={goBack}
          aria-label={previous ? `Back to ${previous.name}` : 'Back'}
          className="glass ctrl pointer-events-auto h-full self-stretch px-4"
        >
          <span className="rotate-180">
            <ArrowIcon size={15} />
          </span>
          <span className="label hidden sm:inline">Back</span>
        </button>
      ) : null}

      <div className="glass pointer-events-auto px-5 py-3.5">
        <p className="label text-white/45">{project.name}</p>
        <p className="mt-1 max-w-[46vw] truncate text-[13px] font-light text-white/85 md:max-w-xs">
          {currentParams?.title ?? currentView.name}
        </p>
        {currentParams?.subtitle ? (
          <p className="mt-0.5 max-w-[46vw] truncate text-[11px] text-white/40 md:max-w-xs">
            {currentParams.subtitle}
          </p>
        ) : null}
      </div>
    </nav>
  )
}
