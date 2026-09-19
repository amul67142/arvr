import { Component } from 'react'

/**
 * Catches GLTF parse failures raised inside the Canvas. Nothing is rendered in
 * its place — the error is handed back to the app, which shows a DOM screen,
 * because a WebGL tree cannot render an error message.
 */
export default class ModelErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error('[viewer] model load failed', error)
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
