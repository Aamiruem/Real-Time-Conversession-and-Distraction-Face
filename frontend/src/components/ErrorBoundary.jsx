import { Component } from "react";

/** Keeps a crash inside one page: the menu and sidebar stay usable, instead of the whole app going blank. */
export class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Page crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="card empty-state" role="alert">
        <span aria-hidden="true">⚠️</span>
        <h2>This page hit a problem</h2>
        <p className="muted">Your data is safe. Reload the page, or open another section from the menu.</p>
        <button type="button" className="btn" onClick={() => location.reload()}>
          ↻ Reload
        </button>
      </div>
    );
  }
}
