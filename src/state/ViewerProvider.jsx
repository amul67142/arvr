import { useCallback, useMemo, useReducer, useRef } from 'react'

import { ViewerContext } from './viewerStore'

/**
 * Viewer state lives in a reducer rather than scattered useState calls so the
 * planned Tower -> Floor -> Unit drill-down is an additive change: `selection`
 * already carries a `level`, and SELECT can grow a stack without touching the
 * components that read it.
 */

const initialState = {
  model: null,
  // { level: 'tower' | 'floor', id, name, object, floor?: { id, number, name, object } }
  // `id` is always the building's, so everything keyed on the selected
  // building keeps working when the selection narrows to one of its floors.
  selection: null,
  focusRequest: null, // { object | null, nonce, padding? }
  timeOfDay: 'day',
  inspectorOpen: false,
  nonce: 0,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_MODEL':
      return { ...state, model: action.model }

    case 'SELECT': {
      const nonce = state.nonce + 1
      return {
        ...state,
        selection: {
          level: 'tower',
          id: action.entry.id,
          name: action.entry.name,
          object: action.entry.object,
        },
        focusRequest: { object: action.entry.object, nonce },
        nonce,
      }
    }

    case 'SELECT_FLOOR': {
      const nonce = state.nonce + 1
      const { entry, floor } = action
      return {
        ...state,
        selection: {
          level: 'floor',
          id: entry.id,
          name: entry.name,
          object: entry.object,
          floor: { id: floor.id, number: floor.number, name: floor.name, object: floor.object },
        },
        // Framed looser than a building, so the neighbouring floors stay in
        // view and the buyer can read where on the tower they are.
        focusRequest: { object: floor.object, nonce, padding: 2.4 },
        nonce,
      }
    }

    case 'FOCUS': {
      const nonce = state.nonce + 1
      return { ...state, focusRequest: { object: action.object, nonce }, nonce }
    }

    case 'CLEAR_SELECTION':
      return { ...state, selection: null }

    case 'RESET_VIEW': {
      const nonce = state.nonce + 1
      return {
        ...state,
        selection: null,
        focusRequest: { object: null, nonce },
        nonce,
      }
    }

    case 'SET_TIME_OF_DAY':
      return { ...state, timeOfDay: action.value }

    case 'SET_INSPECTOR':
      return { ...state, inspectorOpen: action.value }

    default:
      return state
  }
}

export function ViewerProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Imperative handles. Deliberately refs: camera work runs at 60fps and must
  // never round-trip through React state.
  const controlsRef = useRef(null)
  const hoverLabelRef = useRef(null)
  // Set by the model: highlight a floor while the buyer hovers its number in
  // the panel, without a React render per hover.
  const floorPreviewRef = useRef(null)

  const setModel = useCallback((model) => dispatch({ type: 'SET_MODEL', model }), [])
  const selectTower = useCallback((entry) => dispatch({ type: 'SELECT', entry }), [])
  const selectFloor = useCallback(
    (entry, floor) => dispatch({ type: 'SELECT_FLOOR', entry, floor }),
    [],
  )
  const clearSelection = useCallback(() => dispatch({ type: 'CLEAR_SELECTION' }), [])
  const focusObject = useCallback((object) => dispatch({ type: 'FOCUS', object }), [])
  const resetView = useCallback(() => dispatch({ type: 'RESET_VIEW' }), [])
  const setTimeOfDay = useCallback(
    (value) => dispatch({ type: 'SET_TIME_OF_DAY', value }),
    [],
  )
  const setInspectorOpen = useCallback(
    (value) => dispatch({ type: 'SET_INSPECTOR', value }),
    [],
  )

  const value = useMemo(
    () => ({
      ...state,
      controlsRef,
      hoverLabelRef,
      floorPreviewRef,
      setModel,
      selectTower,
      selectFloor,
      clearSelection,
      focusObject,
      resetView,
      setTimeOfDay,
      setInspectorOpen,
    }),
    [
      state,
      setModel,
      selectTower,
      selectFloor,
      clearSelection,
      focusObject,
      resetView,
      setTimeOfDay,
      setInspectorOpen,
    ],
  )

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
}
