import React from 'react';
import { AlertCircle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSafeErrorMessage } from '@/lib/utils';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

/**
 * Error boundary with warm dark styling
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-hearth-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            {/* Error icon */}
            <div className="relative w-32 h-32 mx-auto">
              <div className="absolute inset-0 bg-rose/10 rounded-full blur-xl" />
              <div className="relative w-full h-full flex items-center justify-center">
                <AlertCircle className="w-20 h-20 text-rose/60" />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-heading font-bold text-warm-50">
                Something Went Wrong
              </h1>
              <p className="text-warm-200">
                An unexpected error occurred. Please try again.
              </p>
            </div>

            {this.state.error && (
              <div className="p-4 rounded-xl bg-rose/5 border border-rose/30 text-left">
                <p className="text-sm font-mono text-warm-400 break-words">
                  {getSafeErrorMessage(this.state.error, 'An unexpected error occurred.')}
                </p>
                {import.meta.env.DEV && (
                  <details className="mt-2">
                    <summary className="text-xs text-warm-600 cursor-pointer">Technical details</summary>
                    <pre className="text-xs font-mono text-warm-400 mt-1 whitespace-pre-wrap">
                      {this.state.error.message}
                      {'\n'}
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={this.handleReset}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Button variant="primary" onClick={() => (window.location.href = '/')}>
                <Home className="h-4 w-4 mr-2" />
                Return Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Fallback component for async errors (e.g., route loading)
 */
export function ErrorFallback({
  error,
  resetError,
}: {
  error: Error;
  resetError: () => void;
}) {
  return (
    <div className="min-h-screen bg-hearth-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 mx-auto">
          <AlertCircle className="w-full h-full text-rose/60" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-heading font-bold text-warm-50">
            Something Went Wrong
          </h1>
          <p className="text-warm-200">{getSafeErrorMessage(error, 'An unexpected error occurred.')}</p>
        </div>
        <Button variant="primary" onClick={resetError}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    </div>
  );
}
