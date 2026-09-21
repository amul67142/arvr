import { useViewer } from '../../state/viewerStore'
import { formatBytes } from '../../utils/modelUtils'
import {
  CollapseIcon,
  CubeIcon,
  ExpandIcon,
  LayersIcon,
  MoonIcon,
  ResetIcon,
  SunIcon,
  UploadIcon,
} from '../common/Icons'

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-white/12" />
}

/**
 * `chrome` flags hide the parts of the Phase 1 control set that an enclosing
 * experience provides itself, or that a buyer should never see. All default to
 * true, so standalone this renders exactly as before.
 */
export default function ViewerControls({ source, onExit, fullscreen, chrome = {} }) {
  const showHeader = chrome.showHeader !== false
  const showUpload = chrome.showUpload !== false
  const showInspector = chrome.showInspector !== false
  const showNotices = chrome.showNotices !== false

  const {
    model,
    timeOfDay,
    setTimeOfDay,
    resetView,
    inspectorOpen,
    setInspectorOpen,
  } = useViewer()

  const towerCount = model?.towers.length ?? 0

  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-6 md:p-8">
        {showHeader ? (
          <div className="glass pointer-events-auto flex items-center gap-4 px-5 py-3.5">
            <span className="text-white/70">
              <CubeIcon size={16} />
            </span>
            <div className="min-w-0">
              <p className="label text-white/45">Interactive Experience</p>
              <p className="mt-1 max-w-[42vw] truncate text-[13px] font-light text-white/85 md:max-w-xs">
                {source.name}
              </p>
            </div>
            <span className="hidden text-[11px] text-white/30 sm:block">
              {formatBytes(source.size)}
            </span>
          </div>
        ) : (
          <span />
        )}

        {showUpload ? (
          <button
            type="button"
            onClick={onExit}
            className="glass ctrl pointer-events-auto px-5 py-3.5"
          >
            <UploadIcon size={15} />
            <span className="label hidden sm:inline">Upload New Model</span>
          </button>
        ) : null}
      </header>

      {showNotices && towerCount === 0 && model ? (
        <div className="glass pointer-events-auto absolute top-28 left-1/2 z-20 w-[min(92vw,430px)] -translate-x-1/2 px-6 py-5 text-center md:top-32">
          <p className="text-sm font-light text-white/80">No named towers detected.</p>
          <p className="mt-2.5 text-xs leading-relaxed text-white/45">
            Open Model Inspector to view objects in this model.
          </p>
          <button
            type="button"
            onClick={() => setInspectorOpen(true)}
            className="label mt-5 border border-white/20 px-5 py-2.5 text-white/75 transition-colors duration-500 hover:bg-white/10 hover:text-white"
          >
            Open Model Inspector
          </button>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-5 md:p-8">
        <nav className="glass pointer-events-auto flex flex-wrap items-center justify-center gap-1 px-2.5 py-2">
          <button
            type="button"
            onClick={() => setTimeOfDay('day')}
            data-active={timeOfDay === 'day'}
            className="ctrl"
          >
            <SunIcon size={15} />
            <span className="label">Day</span>
          </button>

          <button
            type="button"
            onClick={() => setTimeOfDay('night')}
            data-active={timeOfDay === 'night'}
            className="ctrl"
          >
            <MoonIcon size={15} />
            <span className="label">Night</span>
          </button>

          <Divider />

          <button type="button" onClick={resetView} className="ctrl">
            <ResetIcon size={15} />
            <span className="label hidden sm:inline">Reset View</span>
          </button>

          {showInspector ? (
            <button
              type="button"
              onClick={() => setInspectorOpen(!inspectorOpen)}
              data-active={inspectorOpen}
              className="ctrl"
            >
              <LayersIcon size={15} />
              <span className="label hidden sm:inline">Inspector</span>
            </button>
          ) : null}

          <button type="button" onClick={fullscreen.toggle} className="ctrl">
            {fullscreen.isFullscreen ? (
              <CollapseIcon size={15} />
            ) : (
              <ExpandIcon size={15} />
            )}
            <span className="label hidden md:inline">
              {fullscreen.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </span>
          </button>
        </nav>
      </div>
    </>
  )
}
