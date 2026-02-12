/**
 * 404 Page - warm dark theme
 */
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-hearth-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Illustration */}
        <div className="relative">
          <div className="absolute inset-0 bg-amber/5 rounded-full blur-2xl" />
          <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
            <div className="w-32 h-32 rounded-full border-2 border-amber/20 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full border border-amber/10 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-amber/40" />
              </div>
            </div>
          </div>
        </div>

        {/* Text */}
        <div className="space-y-4">
          <h1 className="text-6xl font-heading font-bold text-warm-600">
            404
          </h1>
          <h2 className="text-2xl font-heading font-semibold text-warm-50">
            Page Not Found
          </h2>
          <p className="text-warm-400">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="primary"
            onClick={() => (window.location.href = '/')}
          >
            <Home className="h-4 w-4 mr-2" />
            Return Home
          </Button>
          <Button
            variant="outline"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
