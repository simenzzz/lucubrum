/**
 * Minimal site footer — grounds every page below the routed content.
 * Hidden on immersive routes (roadmap canvas, login) where extra scroll
 * under a fixed-height / full-screen layout would only cause jank.
 */
import { useLocation } from 'react-router-dom';
import { Sparkles, Github } from 'lucide-react';

const HIDDEN_ROUTE_PREFIXES = ['/roadmap/', '/login', '/oauth/'];

// From .env(.example); empty/unset hides the link (e.g. while the repo is private)
const GITHUB_URL: string | undefined = import.meta.env.VITE_GITHUB_URL;

export function Footer() {
  const { pathname } = useLocation();

  if (HIDDEN_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <footer className="border-t border-border-subtle bg-hearth-800/50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Wordmark */}
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber" aria-hidden="true" />
            <div className="flex items-baseline gap-2">
              <span className="font-heading font-bold text-warm-50">Lucubrum</span>
              <span className="text-xs text-warm-400">Shape Your Path</span>
            </div>
          </div>

          {/* Links + copyright */}
          <div className="flex items-center gap-4 text-sm text-warm-400">
            {GITHUB_URL && (
              <>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-amber transition-colors"
                >
                  <Github className="h-4 w-4" aria-hidden="true" />
                  GitHub
                </a>
                <span aria-hidden="true" className="text-warm-600">·</span>
              </>
            )}
            <span>© {new Date().getFullYear()} Lucubrum</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
