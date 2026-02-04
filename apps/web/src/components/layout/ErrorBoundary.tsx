import React from 'react';
import { Anchor, Home, RefreshCw } from 'lucide-react';
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
 * Shipwreck-themed error boundary
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
        <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            {/* Shipwreck illustration */}
            <div className="relative w-32 h-32 mx-auto">
              <div className="absolute inset-0 bg-ocean/10 rounded-full blur-xl" />
              <svg
                viewBox="0 0 100 100"
                className="w-full h-full text-ink drop-shadow-lg"
                fill="currentColor"
              >
                {/* Broken mast */}
                <path d="M50 20 L45 60 L40 60 L45 20 Z" />
                <path d="M50 25 L55 65 L60 65 L55 25 Z" opacity="0.6" />
                {/* Hull */}
                <path d="M20 70 Q50 85 80 70 L75 80 Q50 90 25 80 Z" />
                {/* Wave */}
                <path
                  d="M10 85 Q30 75 50 85 Q70 95 90 85"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-ocean/30"
                />
                {/* Anchor */}
                <circle cx="50" cy="50" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
                <line x1="50" y1="58" x2="50" y2="70" strokeWidth="2" />
                <path d="M42 70 Q50 75 58 70" fill="none" strokeWidth="2" />
              </svg>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-heading font-bold text-ink">
                Lost at Sea
              </h1>
              <p className="text-ink/70">
                Something went wrong on your voyage. The charts have been lost.
              </p>
            </div>

            {this.state.error && (
              <div className="p-4 rounded-lg bg-terracotta/10 border border-terracotta/30 text-left">
                <p className="text-sm font-mono text-ink/60 break-words">
                  {getSafeErrorMessage(this.state.error, 'An unexpected error occurred.')}
                </p>
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
    <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 mx-auto">
          <Anchor className="w-full h-full text-terracotta" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-heading font-bold text-ink">
            Anchors Away!
          </h1>
          <p className="text-ink/70">{getSafeErrorMessage(error, 'An unexpected error occurred.')}</p>
        </div>
        <Button variant="primary" onClick={resetError}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    </div>
  );
}
