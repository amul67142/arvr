import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'

import { getTowerMetadata, unitTypes } from '../data/towerMetadata'
import { createAssetForType, describeAsset, fetchDemoFile } from './assetSources'
import { ExperienceContext, MODES } from './experienceStore'
import { clearProject, loadProject, saveProject } from './persistence'

/**
 * State is split into what survives a reload and what does not:
 *
 *   persisted  project, views (metadata only), towerTargets, unitTypeTargets
 *   session    assets (blob URLs), viewTowers (read from loaded models),
 *              currentViewId, history, mode
 *
 * A view can therefore exist without its asset — that is exactly the state
 * every view is in after a refresh, and the UI treats it as such.
 */

const emptyState = {
  project: null, // { id, name, startViewId }
  views: [], // [{ id, name, type, asset: { fileName, extension, size } | null }]
  assets: {}, // { [viewId]: session asset }            — never persisted
  towerTargets: {}, // { [towerName]: viewId | null }   — explicit overrides
  unitTypeTargets: {}, // { [unitType]: viewId | null } — explicit overrides
  viewTowers: {}, // { [viewId]: string[] }             — never persisted
  currentViewId: null,
  // Context the current view was opened with, e.g. { title: 'Unit 18D' }.
  // Travels with history, so Back restores it.
  currentParams: null,
  history: [], // [{ id, params }]
  mode: MODES.EDITOR,
}

function initialise() {
  const saved = loadProject()
  if (!saved) return emptyState

  return {
    ...emptyState,
    project: saved.project,
    views: saved.views,
    towerTargets: saved.towerTargets,
    unitTypeTargets: saved.unitTypeTargets,
    currentViewId: saved.project.startViewId ?? saved.views[0]?.id ?? null,
    // Files never survive a reload, so a restored project always opens in the
    // editor, where they can be re-attached.
    mode: MODES.EDITOR,
  }
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'view'
  )
}

/**
 * View ids are slugs of their names, so "Tower D Exterior" becomes
 * "tower-d-exterior". That keeps ids readable in storage and lets a tower's
 * default targetViewId in towerMetadata.js resolve without extra wiring.
 */
function uniqueViewId(name, views) {
  const base = slugify(name)
  const taken = new Set(views.map((view) => view.id))
  if (!taken.has(base)) return base
  let suffix = 2
  while (taken.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

/** "aravali-vista_masterplan.glb" -> "Aravali Vista Masterplan" */
function nameFromFile(fileName) {
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
  if (!stem) return 'Untitled Project'
  return stem.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/**
 * The bundled demo: every view type, wired end to end. Files are served from
 * public/demo, so unlike uploads they can be fetched again after a reload.
 */
const DEMO_PROJECT = {
  project: { id: 'aravali-vista-demo', name: 'Aravali Vista', startViewId: 'masterplan' },
  views: [
    { id: 'masterplan', name: 'Masterplan', type: '3d', src: '/demo/masterplan.glb' },
    { id: 'tower-d-exterior', name: 'Tower D Exterior', type: 'image', src: '/demo/tower-d-render.png' },
    { id: '3bhk-walkthrough', name: '3BHK Walkthrough', type: 'walkthrough', src: '/demo/unit-3bhk.glb' },
    { id: 'amenities-walkthrough', name: 'Amenities Walkthrough', type: 'walkthrough', src: '/demo/amenities.glb' },
  ],
}

function omit(object, key) {
  if (!(key in object)) return object
  const next = { ...object }
  delete next[key]
  return next
}

function sameList(a = [], b = []) {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function reducer(state, action) {
  switch (action.type) {
    case 'CREATE_PROJECT':
      return {
        ...emptyState,
        project: action.project,
        views: [action.view],
        assets: { [action.view.id]: action.asset },
        currentViewId: action.view.id,
        mode: MODES.EDITOR,
      }

    case 'LOAD_PROJECT':
      return {
        ...emptyState,
        project: action.project,
        views: action.views,
        assets: action.assets,
        currentViewId: action.project.startViewId,
        mode: MODES.EDITOR,
      }

    case 'RENAME_PROJECT':
      return { ...state, project: { ...state.project, name: action.name } }

    case 'ADD_VIEW':
      return {
        ...state,
        views: [...state.views, action.view],
        assets: { ...state.assets, [action.view.id]: action.asset },
        currentViewId: action.view.id,
        currentParams: null,
      }

    case 'RENAME_VIEW':
      return {
        ...state,
        views: state.views.map((view) =>
          view.id === action.id ? { ...view, name: action.name } : view,
        ),
      }

    case 'REMOVE_VIEW': {
      const views = state.views.filter((view) => view.id !== action.id)
      const fallback = views[0]?.id ?? null

      // Any tower or unit type that pointed here now points nowhere.
      const towerTargets = Object.fromEntries(
        Object.entries(state.towerTargets).filter(([, target]) => target !== action.id),
      )
      const unitTypeTargets = Object.fromEntries(
        Object.entries(state.unitTypeTargets).filter(([, target]) => target !== action.id),
      )

      return {
        ...state,
        views,
        assets: omit(state.assets, action.id),
        viewTowers: omit(state.viewTowers, action.id),
        towerTargets,
        unitTypeTargets,
        history: state.history.filter((entry) => entry.id !== action.id),
        currentViewId: state.currentViewId === action.id ? fallback : state.currentViewId,
        currentParams: state.currentViewId === action.id ? null : state.currentParams,
        project: {
          ...state.project,
          startViewId:
            state.project.startViewId === action.id ? fallback : state.project.startViewId,
        },
      }
    }

    case 'SET_ASSET':
      return {
        ...state,
        assets: { ...state.assets, [action.viewId]: action.asset },
        views: state.views.map((view) =>
          view.id === action.viewId ? { ...view, asset: describeAsset(action.asset) } : view,
        ),
      }

    case 'SET_START_VIEW':
      return { ...state, project: { ...state.project, startViewId: action.id } }

    case 'SET_TOWER_TARGET':
      return {
        ...state,
        towerTargets: { ...state.towerTargets, [action.tower]: action.viewId },
      }

    case 'SET_UNIT_TYPE_TARGET':
      return {
        ...state,
        unitTypeTargets: { ...state.unitTypeTargets, [action.unitType]: action.viewId },
      }

    case 'SET_VIEW_TOWERS':
      if (sameList(state.viewTowers[action.viewId], action.names)) return state
      return { ...state, viewTowers: { ...state.viewTowers, [action.viewId]: action.names } }

    // Editor selection: choosing what to edit is not a journey, so it leaves no
    // history behind.
    case 'SELECT_VIEW':
      if (state.currentViewId === action.id) return state
      return { ...state, currentViewId: action.id, currentParams: null, history: [] }

    // In-experience navigation: every step can be walked back.
    case 'NAVIGATE': {
      const params = action.params ?? null
      if (state.currentViewId === action.id && state.currentParams === params) return state
      return {
        ...state,
        history: state.currentViewId
          ? [...state.history, { id: state.currentViewId, params: state.currentParams }]
          : state.history,
        currentViewId: action.id,
        currentParams: params,
      }
    }

    case 'BACK': {
      if (state.history.length === 0) return state
      const previous = state.history[state.history.length - 1]
      return {
        ...state,
        history: state.history.slice(0, -1),
        currentViewId: previous.id,
        currentParams: previous.params,
      }
    }

    case 'SET_MODE':
      if (action.mode === MODES.SHOWCASE) {
        // A presentation always starts from the top.
        return {
          ...state,
          mode: MODES.SHOWCASE,
          history: [],
          currentViewId: state.project?.startViewId ?? state.currentViewId,
          currentParams: null,
        }
      }
      return { ...state, mode: MODES.EDITOR, history: [], currentParams: null }

    case 'RESET':
      return emptyState

    default:
      return state
  }
}

export function ExperienceProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialise)

  /**
   * The single owner of every object URL in the app. Keyed by view id so
   * replacing or deleting one view's file revokes exactly that view's URLs.
   *
   * URLs are revoked on replace, on delete and on unmount — never on view
   * switch. A 3D view that is merely off-screen is still holding its model.
   */
  const urlsByView = useRef(new Map())

  const releaseView = useCallback((viewId) => {
    const urls = urlsByView.current.get(viewId)
    if (!urls) return
    urls.forEach((url) => URL.revokeObjectURL(url))
    urlsByView.current.delete(viewId)
  }, [])

  const releaseAll = useCallback(() => {
    urlsByView.current.forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)))
    urlsByView.current.clear()
  }, [])

  useEffect(() => releaseAll, [releaseAll])

  // Metadata only. Session assets are in a slice this never touches.
  useEffect(() => {
    if (!state.project) return
    saveProject({
      project: state.project,
      views: state.views,
      towerTargets: state.towerTargets,
      unitTypeTargets: state.unitTypeTargets,
    })
  }, [state.project, state.views, state.towerTargets, state.unitTypeTargets])

  // -- project ------------------------------------------------------------ --

  /** First run: the uploaded model becomes the project's start view. */
  const createProject = useCallback(
    (file, companions = []) => {
      releaseAll()

      const view = { id: 'masterplan', name: 'Masterplan', type: '3d', asset: null }
      const { asset, urls } = createAssetForType('3d', file, companions)
      urlsByView.current.set(view.id, urls)

      dispatch({
        type: 'CREATE_PROJECT',
        project: { id: 'project-1', name: nameFromFile(file.name), startViewId: view.id },
        view: { ...view, asset: describeAsset(asset) },
        asset,
      })
    },
    [releaseAll],
  )

  const renameProject = useCallback(
    (name) => dispatch({ type: 'RENAME_PROJECT', name: name.trim() || 'Untitled Project' }),
    [],
  )

  const resetProject = useCallback(() => {
    releaseAll()
    clearProject()
    dispatch({ type: 'RESET' })
  }, [releaseAll])

  /**
   * After a reload, views whose file came from the app's own demo folder fetch
   * it again. Uploaded files cannot be recovered and are left for the editor to
   * ask about — a blob URL does not survive a refresh, and pretending otherwise
   * would be worse than asking.
   */
  const restoring = useRef(new Set())

  useEffect(() => {
    for (const view of state.views) {
      const src = view.asset?.demoSrc
      if (!src || state.assets[view.id] || restoring.current.has(view.id)) continue
      restoring.current.add(view.id)
      fetchDemoFile(src)
        .then((file) => {
          const { asset, urls } = createAssetForType(view.type, file)
          asset.demoSrc = src
          releaseView(view.id)
          urlsByView.current.set(view.id, urls)
          dispatch({ type: 'SET_ASSET', viewId: view.id, asset })
        })
        .catch(() => {
          // Left unattached; the editor offers the file picker as usual.
        })
        .finally(() => restoring.current.delete(view.id))
    }
  }, [releaseView, state.assets, state.views])

  /** Build the demo project from the app's bundled files. */
  const loadDemoProject = useCallback(async () => {
    const files = await Promise.all(DEMO_PROJECT.views.map((view) => fetchDemoFile(view.src)))
    releaseAll()

    const assets = {}
    const views = DEMO_PROJECT.views.map((view, index) => {
      const { asset, urls } = createAssetForType(view.type, files[index])
      asset.demoSrc = view.src
      urlsByView.current.set(view.id, urls)
      assets[view.id] = asset
      return { id: view.id, name: view.name, type: view.type, asset: describeAsset(asset) }
    })

    dispatch({ type: 'LOAD_PROJECT', project: DEMO_PROJECT.project, views, assets })
  }, [releaseAll])

  // -- views -------------------------------------------------------------- --

  const addView = useCallback(
    ({ name, type, file, companions = [] }) => {
      const cleanName = name.trim() || 'Untitled View'
      const id = uniqueViewId(cleanName, state.views)
      const { asset, urls } = createAssetForType(type, file, companions)
      urlsByView.current.set(id, urls)

      dispatch({
        type: 'ADD_VIEW',
        view: { id, name: cleanName, type, asset: describeAsset(asset) },
        asset,
      })
      return id
    },
    [state.views],
  )

  /** Attach or replace a view's file. The previous file's URLs go first. */
  const attachAsset = useCallback(
    (viewId, file, companions = []) => {
      const view = state.views.find((candidate) => candidate.id === viewId)
      if (!view) return

      releaseView(viewId)
      const { asset, urls } = createAssetForType(view.type, file, companions)
      urlsByView.current.set(viewId, urls)
      dispatch({ type: 'SET_ASSET', viewId, asset })
    },
    [releaseView, state.views],
  )

  const renameView = useCallback((id, name) => {
    const clean = name.trim()
    if (clean) dispatch({ type: 'RENAME_VIEW', id, name: clean })
  }, [])

  const removeView = useCallback(
    (id) => {
      releaseView(id)
      dispatch({ type: 'REMOVE_VIEW', id })
    },
    [releaseView],
  )

  const setStartView = useCallback((id) => dispatch({ type: 'SET_START_VIEW', id }), [])

  // -- navigation --------------------------------------------------------- --

  /** Open a view, optionally with context: { title, subtitle, ... }. */
  const navigateToView = useCallback(
    (id, params) => dispatch({ type: 'NAVIGATE', id, params }),
    [],
  )
  const goBack = useCallback(() => dispatch({ type: 'BACK' }), [])
  const selectView = useCallback((id) => dispatch({ type: 'SELECT_VIEW', id }), [])
  const setMode = useCallback((mode) => dispatch({ type: 'SET_MODE', mode }), [])

  // -- tower links -------------------------------------------------------- --

  const setTowerTarget = useCallback(
    (tower, viewId) => dispatch({ type: 'SET_TOWER_TARGET', tower, viewId: viewId || null }),
    [],
  )

  const setUnitTypeTarget = useCallback(
    (unitType, viewId) =>
      dispatch({ type: 'SET_UNIT_TYPE_TARGET', unitType, viewId: viewId || null }),
    [],
  )

  const setViewTowers = useCallback(
    (viewId, names) => dispatch({ type: 'SET_VIEW_TOWERS', viewId, names }),
    [],
  )

  /**
   * Where a tower's EXPLORE button leads. An explicit editor choice wins —
   * including an explicit "none" — over the default in towerMetadata.js. A
   * target is only returned if it can actually be shown: the view must exist
   * and have its file attached, so a presentation never dead-ends.
   */
  const resolveTowerTarget = useCallback(
    (towerName) => {
      if (!towerName) return null

      const explicit = Object.prototype.hasOwnProperty.call(state.towerTargets, towerName)
      const target = explicit
        ? state.towerTargets[towerName]
        : getTowerMetadata(towerName).targetViewId

      if (!target) return null
      const exists = state.views.some((view) => view.id === target)
      return exists && state.assets[target] ? target : null
    },
    [state.assets, state.towerTargets, state.views],
  )

  /** Where a unit's WALKTHROUGH leads: same rules as a tower's EXPLORE. */
  const resolveUnitTypeTarget = useCallback(
    (unitType) => {
      if (!unitType) return null
      const explicit = Object.prototype.hasOwnProperty.call(state.unitTypeTargets, unitType)
      const target = explicit ? state.unitTypeTargets[unitType] : unitTypes[unitType]?.targetViewId
      if (!target) return null
      const exists = state.views.some((view) => view.id === target)
      return exists && state.assets[target] ? target : null
    },
    [state.assets, state.unitTypeTargets, state.views],
  )

  const currentView = useMemo(
    () => state.views.find((view) => view.id === state.currentViewId) ?? null,
    [state.currentViewId, state.views],
  )

  const value = useMemo(
    () => ({
      ...state,
      currentView,
      canGoBack: state.history.length > 0,
      createProject,
      renameProject,
      resetProject,
      addView,
      attachAsset,
      renameView,
      removeView,
      setStartView,
      navigateToView,
      goBack,
      selectView,
      setMode,
      setTowerTarget,
      setViewTowers,
      resolveTowerTarget,
      setUnitTypeTarget,
      resolveUnitTypeTarget,
      loadDemoProject,
    }),
    [
      state,
      currentView,
      createProject,
      renameProject,
      resetProject,
      addView,
      attachAsset,
      renameView,
      removeView,
      setStartView,
      navigateToView,
      goBack,
      selectView,
      setMode,
      setTowerTarget,
      setViewTowers,
      resolveTowerTarget,
      setUnitTypeTarget,
      resolveUnitTypeTarget,
      loadDemoProject,
    ],
  )

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>
}
