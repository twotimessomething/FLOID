import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * What shows when the timeline throws. It says what happened in words a person
 * can act on and offers the way back — a reload, which starts again from what
 * was last saved — with the error itself kept small underneath, for a bug
 * report rather than for reading.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-1 items-center justify-center p-8 text-center bg-[var(--color-background)]">
          <div className="max-w-sm">
            <h2 className="text-title font-medium text-[var(--color-text-primary)] mb-2">
              Something went wrong
            </h2>
            <p className="text-body text-[var(--color-text-secondary)] mb-4">
              The timeline ran into a problem it couldn’t draw past. Your projects are kept on
              this device, and reloading usually sets things right.
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="primary" onClick={() => window.location.reload()}>
                Reload
              </Button>
              <Button variant="ghost" onClick={() => this.setState({ hasError: false, error: null })}>
                Try again
              </Button>
            </div>
            {this.state.error?.message && (
              <p className="mt-6 text-xs text-[var(--color-text-muted)] break-words">
                {this.state.error.message}
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
