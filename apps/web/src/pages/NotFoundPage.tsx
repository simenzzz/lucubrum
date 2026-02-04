/**
 * 404 - Lost at Sea page
 */
import { Home, Anchor } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Illustration */}
        <div className="relative">
          <div className="absolute inset-0 bg-ocean/10 rounded-full blur-2xl" />
          <svg
            viewBox="0 0 200 200"
            className="w-48 h-48 mx-auto relative"
          >
            {/* Ocean waves */}
            <path
              d="M0 140 Q50 120 100 140 T200 140 L200 200 L0 200 Z"
              className="fill-ocean/20"
            />
            <path
              d="M0 160 Q50 140 100 160 T200 160 L200 200 L0 200 Z"
              className="fill-ocean/30"
            />

            {/* Compass */}
            <g transform="translate(100, 80)">
              <circle
                r="40"
                fill="none"
                stroke="#C4A052"
                strokeWidth="2"
              />
              <circle
                r="32"
                fill="none"
                stroke="#1A1915"
                strokeWidth="1"
              />
              {/* Compass needle spinning */}
              <g className="origin-center animate-spin-slow">
                <polygon
                  points="0,-28 -4,0 0,28 4,0"
                  fill="#8B8680"
                />
                <polygon
                  points="0,-28 -4,0 0,10"
                  fill="#C4A052"
                />
              </g>
              <circle r="4" fill="#1A1915" />
            </g>

            {/* Anchor */}
            <g transform="translate(150, 120)">
              <circle
                r="8"
                fill="none"
                stroke="#1A1915"
                strokeWidth="2"
              />
              <line
                x1="0"
                y1="8"
                x2="0"
                y2="25"
                stroke="#1A1915"
                strokeWidth="2"
              />
              <path
                d="M-8 25 Q0 30 8 25"
                fill="none"
                stroke="#1A1915"
                strokeWidth="2"
              />
            </g>
          </svg>
        </div>

        {/* Text */}
        <div className="space-y-4">
          <h1 className="text-6xl font-heading font-bold text-ink/20">
            404
          </h1>
          <h2 className="text-2xl font-heading font-semibold text-ink">
            Lost at Sea
          </h2>
          <p className="text-ink/60">
            The charts you're looking for don't exist or have been moved to uncharted waters.
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
            <Anchor className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
