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
        <div className="flex items-center justify-center p-8 text-center bg-[var(--color-background)]">
          <div>
            <h2 className="text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              {this.state.error?.message ?? 'An unexpected error occurred'}
            </p>
            <Button variant="primary" onClick={() => this.setState({ hasError: false, error: null })}>
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
