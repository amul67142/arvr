import { useCallback, useEffect, useRef, useState } from 'react'

import { pickMainFile } from '../../experience/assetSources'
import { MODES, useExperience } from '../../experience/experienceStore'
import { getViewType, isAcceptedFile, viewTypeLabel } from '../../experience/viewTypes'
import { ViewerProvider } from '../../state/ViewerProvider'
import { useViewer } from '../../state/viewerStore'
import { formatBytes } from '../../utils/modelUtils'
import ErrorState from '../common/ErrorState'
import { UploadIcon } from '../common/Icons'
import ProjectViewer from '../viewer/ProjectViewer'
import WalkthroughView from '../walkthrough/WalkthroughView'
import BackNavigation from './BackNavigation'
import ImageView from './ImageView'

/**
 * Publishes the towers a loaded 3D view detected, so the editor can offer
 * tower → view links. Lives inside the 3D view's ViewerProvider because that
 * is where the model is known; renders nothing.
 */
function TowerRegistry({ viewId }) {
  const { model } = useViewer()
  const { setViewTowers } = useExperience()

  useEffect(() => {
    if (model) setViewTowers(viewId, model.towers.map((tower) => tower.name))
  }, [model, setViewTowers, viewId])

  return null
}

/** A view whose file did not survive a reload, or never arrived. */
function MissingAsset({ view, isEditor, onAttach, onExitPreview }) {
  return (
    <div className="grid h-full w-full place-items-center bg-neutral-950 px-6">
      <div className="max-w-md text-center">
        <span className="inline-flex text-white/30">
          <UploadIcon size={26} />
        </span>
        <p className="label mt-7 text-white/40">{viewTypeLabel(view.type)}</p>
        <h2 className="display mt-4 text-4xl text-white">{view.name}</h2>

        {isEditor ? (
          <>
            <p className="mt-5 text-sm leading-relaxed text-white/45">
              {view.asset
                ? 'Files are kept only for this browser session, so this one needs re-attaching after a refresh.'
                : 'No file is attached to this view yet.'}
            </p>
            {view.asset ? (
              <p className="mt-2 text-xs text-white/30">
                Expected: {view.asset.fileName} · {formatBytes(view.asset.size)}
              </p>
            ) : null}
            <button
              type="button"
              onClick={onAttach}
              className="label mx-auto mt-9 flex items-center gap-3 bg-white px-7 py-3.5 text-neutral-950 transition-colors duration-500 hover:bg-white/85"
            >
              <UploadIcon size={15} />
              {view.asset ? 'Re-attach File' : 'Attach File'}
            </button>
          </>
        ) : (
          <>
            <p className="mt-5 text-sm leading-relaxed text-white/45">
              This view is not available in the current session.
            </p>
            <button
              type="button"
              onClick={onExitPreview}
              className="label mx-auto mt-9 flex items-center gap-3 border border-white/20 px-7 py-3.5 text-white/75 transition-colors duration-500 hover:bg-white/10"
            >
              Return to Editor
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Chooses the renderer for the current view.
 *
 * 3D views are kept alive once visited: switching to an image hides the canvas
 * and pauses its render loop instead of unmounting it. Unmounting would dispose
 * the model, so Back would re-parse the file, replay the loading screen and
 * lose the buyer's camera position. Image views are cheap and simply mount.
 */
export default function ExperienceViewer() {
  const { views, assets, currentView, currentParams, mode, attachAsset, setMode } =
    useExperience()
  const isEditor = mode === MODES.EDITOR

  const [visited3d, setVisited3d] = useState([])
  const [failedAssetId, setFailedAssetId] = useState(null)
  const inputRef = useRef(null)

  const currentAsset = currentView ? assets[currentView.id] : null

  // Remember every 3D view that has been shown, so it can be kept alive.
  if (
    currentView?.type === '3d' &&
    currentAsset &&
    !visited3d.includes(currentView.id)
  ) {
    setVisited3d([...visited3d, currentView.id])
  }

  // A cursor left as a pointer by a hovered tower must not follow the buyer
  // onto the next view.
  useEffect(() => {
    document.body.style.cursor = ''
  }, [currentView?.id])

  const openPicker = useCallback(() => inputRef.current?.click(), [])

  const handleFiles = useCallback(
    (files) => {
      if (!currentView) return
      const picked = pickMainFile(currentView.type, files, isAcceptedFile)
      if (picked) attachAsset(currentView.id, picked.file, picked.companions)
    },
    [attachAsset, currentView],
  )

  const exitPreview = useCallback(() => setMode(MODES.EDITOR), [setMode])

  // Keep only 3D views that still exist and still have a file.
  const live3d = visited3d
    .map((id) => views.find((view) => view.id === id))
    .filter((view) => view?.type === '3d' && assets[view.id])

  const chrome = {
    showHeader: false, // BackNavigation owns the top-left for every view type
    showUpload: false, // files are managed from the editor sidebar
    showInspector: isEditor,
    showNotices: isEditor,
  }

  const showMissing = currentView && !currentAsset
  const currentFailed = Boolean(currentAsset) && failedAssetId === currentAsset.id
  const current3dFailed = currentView?.type === '3d' && currentFailed
  const showImage = currentView?.type === 'image' && currentAsset
  const showWalkthrough = currentView?.type === 'walkthrough' && currentAsset && !currentFailed

  return (
    <div className="relative h-full w-full overflow-hidden bg-neutral-950">
      {live3d.map((view) => {
        const asset = assets[view.id]
        const active = view.id === currentView?.id && !current3dFailed

        return (
          <div
            key={`${view.id}:${asset.id}`}
            aria-hidden={!active}
            className={`absolute inset-0 transition-[opacity,visibility] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              active ? 'visible opacity-100' : 'pointer-events-none invisible opacity-0'
            }`}
          >
            {/* Keyed on the asset, so replacing a view's file gets a fresh
                viewer — the same guarantee Phase 1 gave a new upload. */}
            <ViewerProvider key={asset.id}>
              <ProjectViewer
                source={asset}
                chrome={chrome}
                paused={!active}
                onError={() => setFailedAssetId(asset.id)}
              />
              <TowerRegistry viewId={view.id} />
            </ViewerProvider>
          </div>
        )
      })}

      {showImage ? (
        <div key={`${currentView.id}:${currentAsset.id}`} className="view-enter absolute inset-0">
          <ImageView asset={currentAsset} alt={currentView.name} />
        </div>
      ) : null}

      {showWalkthrough ? (
        // Keyed on the visit as well as the file: entering Unit 12A after 18D
        // is a fresh walk from the front door, not a continuation.
        <div
          key={`${currentView.id}:${currentAsset.id}:${currentParams?.title ?? ''}`}
          className="view-enter absolute inset-0"
        >
          <WalkthroughView
            source={currentAsset}
            onError={() => setFailedAssetId(currentAsset.id)}
          />
        </div>
      ) : null}

      {currentFailed ? (
        <div className="view-enter absolute inset-0">
          <ErrorState
            fileName={currentAsset.name}
            onRetry={isEditor ? openPicker : exitPreview}
          />
        </div>
      ) : null}

      {showMissing ? (
        <div key={`missing:${currentView.id}`} className="view-enter absolute inset-0">
          <MissingAsset
            view={currentView}
            isEditor={isEditor}
            onAttach={openPicker}
            onExitPreview={exitPreview}
          />
        </div>
      ) : null}

      {currentView ? <BackNavigation /> : null}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple={getViewType(currentView?.type)?.multiple ?? false}
        accept={getViewType(currentView?.type)?.accept}
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ''
        }}
      />
    </div>
  )
}
