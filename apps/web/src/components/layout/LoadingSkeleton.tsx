/**
 * Dark-themed loading skeleton with shimmer effect
 */
export function LoadingSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-hearth-900">
      <div className="text-center">
        {/* Spinner */}
        <div className="relative w-24 h-24 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-amber/20 border-t-amber animate-spin" />
          <div className="absolute inset-2 rounded-full border-2 border-amber/10 border-b-amber/40 animate-spin-slow" />
          {/* Center dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-amber/60 animate-pulse" />
          </div>
        </div>

        {/* Loading text */}
        <p className="text-warm-200 font-heading text-lg">Loading...</p>
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
          className="organic-card rounded-xl p-6 space-y-4"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="shimmer h-6 w-3/4 rounded bg-hearth-700" />
          <div className="shimmer h-4 w-full rounded bg-hearth-700" />
          <div className="shimmer h-4 w-2/3 rounded bg-hearth-700" />
        </div>
      ))}
    </>
  );
}

/**
 * Inline skeleton for smaller components
 */
export function InlineSkeleton({ className }: { className?: string }) {
  return <div className={`shimmer h-4 rounded bg-hearth-700 ${className}`} />;
}
