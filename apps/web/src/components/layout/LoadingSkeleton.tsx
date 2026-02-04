/**
 * Parchment-styled loading skeleton with shimmer effect
 */
export function LoadingSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-parchment">
      <div className="text-center">
        {/* Compass spinner */}
        <div className="relative w-24 h-24 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-gold/20 border-t-gold animate-spin" />
          <div className="absolute inset-2 rounded-full border-2 border-gold/10 border-b-gold-muted animate-spin-slow" />
          {/* Compass needle */}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="w-12 h-12 text-gold animate-pulse"
              fill="currentColor"
            >
              <polygon points="12,2 14,12 12,22 10,12" />
              <circle cx="12" cy="12" r="2" className="fill-ink" />
            </svg>
          </div>
        </div>

        {/* Loading text */}
        <p className="text-ink/70 font-heading text-lg">Charting your course...</p>
      </div>
    </div>
  );
}

/**
 * Card skeleton for content loading
 */
export function CardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="parchment-card rounded-lg p-6 space-y-4"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="shimmer h-6 w-3/4 rounded bg-parchment-dark" />
          <div className="shimmer h-4 w-full rounded bg-parchment-dark" />
          <div className="shimmer h-4 w-2/3 rounded bg-parchment-dark" />
        </div>
      ))}
    </>
  );
}

/**
 * Inline skeleton for smaller components
 */
export function InlineSkeleton({ className }: { className?: string }) {
  return <div className={`shimmer h-4 rounded bg-parchment-dark ${className}`} />;
}
