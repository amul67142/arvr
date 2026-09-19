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
  selection: null, // { level, id, name, object }
  focusRequest: null, // { object | null, nonce }
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

  const setModel = useCallback((model) => dispatch({ type: 'SET_MODEL', model }), [])
  const selectTower = useCallback((entry) => dispatch({ type: 'SELECT', entry }), [])
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
      setModel,
      selectTower,
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
      clearSelection,
      focusObject,
      resetView,
      setTimeOfDay,
      setInspectorOpen,
    ],
  )

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
}
