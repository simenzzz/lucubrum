import { ExternalLink, Play, Clock, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { YouTubeResource, PlanNode } from '@/types/api.types';
import { formatDuration } from '@/lib/utils';

interface LearningTabProps {
  node: PlanNode;
  resources: YouTubeResource[];
  isLoading?: boolean;
}

export function LearningTab({ node, resources, isLoading }: LearningTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="flex gap-4">
              <div className="w-40 h-24 bg-parchment-dark rounded-md" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-parchment-dark rounded w-3/4" />
                <div className="h-3 bg-parchment-dark rounded w-1/2" />
                <div className="h-3 bg-parchment-dark rounded w-1/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Node objectives */}
      <div>
        <h4 className="font-heading text-sm font-semibold text-ink mb-2">Learning Objectives</h4>
        <ul className="space-y-1.5">
          {node.objectives.map((objective, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-ink/80">
              <span className="text-gold mt-0.5">•</span>
              {objective}
            </li>
          ))}
        </ul>
      </div>

      {/* YouTube resources */}
      <div>
        <h4 className="font-heading text-sm font-semibold text-ink mb-3">
          Recommended Videos
          {resources.length > 0 && (
            <span className="ml-2 text-ink/50 font-normal">({resources.length})</span>
          )}
        </h4>

        {resources.length === 0 ? (
          <Card className="bg-parchment-dark/50">
            <CardContent className="py-8 text-center">
              <Play className="w-8 h-8 mx-auto text-ink/30 mb-2" />
              <p className="text-sm text-ink/60">No video resources attached yet.</p>
              <p className="text-xs text-ink/40 mt-1">Videos will be curated based on your topic.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {resources.map((resource) => (
              <VideoCard key={resource.video_id} resource={resource} />
            ))}
          </div>
        )}
      </div>

      {/* AI Summary placeholder */}
      <div className="p-4 rounded-lg border border-gold/20 bg-gold/5">
        <div className="flex items-center gap-2 text-sm text-gold-muted">
          <span className="text-lg">✨</span>
          <span className="font-medium">AI Summary</span>
          <Badge variant="secondary" size="sm">Coming Soon</Badge>
        </div>
        <p className="text-xs text-ink/50 mt-1">
          Personalized summaries and key takeaways will appear here.
        </p>
      </div>
    </div>
  );
}

function VideoCard({ resource }: { resource: YouTubeResource }) {
  const videoUrl = `https://www.youtube.com/watch?v=${resource.video_id}`;

  return (
    <a
      href={videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
      <Card className="overflow-hidden hover:shadow-lg hover:border-gold/50 transition-all">
        <div className="flex gap-4 p-3">
          {/* Thumbnail */}
          <div className="relative flex-shrink-0 w-40 h-24 rounded-md overflow-hidden bg-parchment-dark">
            <img
              src={resource.thumbnail_url}
              alt={resource.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {/* Duration overlay */}
            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-ink/80 text-parchment text-xs rounded font-mono">
              {formatDuration(resource.duration_seconds)}
            </div>
            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-ink/0 group-hover:bg-ink/30 transition-colors">
              <div className="w-10 h-10 rounded-full bg-gold/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Play className="w-5 h-5 text-ink fill-current" />
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h5 className="font-medium text-sm text-ink line-clamp-2 group-hover:text-gold transition-colors">
              {resource.title}
            </h5>
            <div className="flex items-center gap-3 mt-2 text-xs text-ink/60">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {resource.channel}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(resource.duration_seconds)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" size="sm">
                {Math.round(resource.relevance_score * 100)}% match
              </Badge>
              <ExternalLink className="w-3 h-3 text-ink/40 group-hover:text-gold transition-colors" />
            </div>
          </div>
        </div>
      </Card>
    </a>
  );
}
