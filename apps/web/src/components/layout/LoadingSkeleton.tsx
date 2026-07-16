/**
 * Full-page loading wrapper: spinner + contextual message.
 * Shared by all pages that block on their initial query.
 */
export function PageLoading({ message }: { message?: string }) {
  return (
    <div className="min-h-screen bg-hearth-900">
      <div className="container mx-auto px-4 py-8">
        <LoadingSkeleton />
        {message && <p className="text-center text-warm-400 mt-4">{message}</p>}
      </div>
    </div>
  );
}

/**
 * Dark-themed full-screen loading spinner
 */
export function LoadingSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-hearth-900">
      <div className="text-center">
        {/* Spinner */}
        <div className="relative w-24 h-24 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-amber/20 border-t-amber animate-spin" />
          <div
            className="absolute inset-2 rounded-full border-2 border-amber/10 border-b-amber/40 animate-spin"
            style={{ animationDuration: '2.5s' }}
          />
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
