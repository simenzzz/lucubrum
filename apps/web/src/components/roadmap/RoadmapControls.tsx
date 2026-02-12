import { ZoomIn, ZoomOut, Maximize, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RoadmapControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
  className?: string;
}

export function RoadmapControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
  className,
}: RoadmapControlsProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 p-1.5 glass-panel',
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onZoomIn}
        disabled={zoom >= 2}
        aria-label="Zoom in"
        className="h-8 w-8"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>

      <div className="text-center text-xs font-mono text-warm-400 py-1">
        {Math.round(zoom * 100)}%
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onZoomOut}
        disabled={zoom <= 0.25}
        aria-label="Zoom out"
        className="h-8 w-8"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>

      <div className="h-px bg-border-moderate my-1" />

      <Button
        variant="ghost"
        size="icon"
        onClick={onFit}
        aria-label="Fit to screen"
        className="h-8 w-8"
      >
        <Maximize className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onReset}
        aria-label="Reset view"
        className="h-8 w-8"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  );
}
