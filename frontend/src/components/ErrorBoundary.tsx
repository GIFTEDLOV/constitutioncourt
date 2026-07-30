import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State { error: Error | null }

/**
 * A render failure must not leave a blank page.
 *
 * A case view that throws while showing a ruling is worse than useless — the
 * reader has no idea whether the case exists, what it says, or whether their
 * own action went through. The boundary states plainly that the display failed
 * and that the contract is unaffected.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render failed:', error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="page page-narrow">
        <h1>This view failed to render</h1>
        <p>
          Something in the interface broke while displaying this page. Nothing on-chain is
          affected: this application holds no funds, and a display failure cannot change a case.
        </p>
        <p className="small muted">
          Reload the page. If it keeps happening, the case can still be read directly from the
          contract through the block explorer.
        </p>
        <pre className="pre">{error.message}</pre>
      </div>
    );
  }
}
