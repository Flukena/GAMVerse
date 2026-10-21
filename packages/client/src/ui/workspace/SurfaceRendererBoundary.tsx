import { Component, type ReactNode } from "react";

interface SurfaceRendererBoundaryProps {
  children: (actions: { retry: () => void; fail: () => void }) => ReactNode;
}

interface SurfaceRendererBoundaryState {
  hasError: boolean;
}

export function createRendererOrReportFailure<T>(createRenderer: () => T, onFailure: () => void): T | null {
  try {
    return createRenderer();
  } catch {
    onFailure();
    return null;
  }
}

export function SurfaceRendererFallback({ onRetry }: { onRetry: () => void }) {
  return <div className="surface-preview-renderer-fallback">
    <div className="surface-preview-static" aria-hidden="true" />
    <button type="button" aria-label="Retry material preview" onClick={onRetry}>Retry preview</button>
  </div>;
}

export class SurfaceRendererBoundary extends Component<SurfaceRendererBoundaryProps, SurfaceRendererBoundaryState> {
  state: SurfaceRendererBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SurfaceRendererBoundaryState {
    return { hasError: true };
  }

  private retry = () => this.setState({ hasError: false });
  private fail = () => this.setState({ hasError: true });

  render() {
    if (this.state.hasError) return <SurfaceRendererFallback onRetry={this.retry} />;
    return this.props.children({ retry: this.retry, fail: this.fail });
  }
}