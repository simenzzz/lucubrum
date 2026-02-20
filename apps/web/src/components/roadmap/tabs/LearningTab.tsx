import { useState, useEffect } from 'react';
import { ExternalLink, Play, Clock, User, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { YouTubeResource, PlanNode, NodeResourceStatus } from '@/types/api.types';
import { formatSeconds } from '@/lib/utils';
import { useNodeLearnContent } from '@/hooks/usePlan';

interface LearningTabProps {
  node: PlanNode;
  planId: string;
  nodeStatus?: NodeResourceStatus;
}

export function LearningTab({ node, planId, nodeStatus }: LearningTabProps) {
  const { data: learnContent, isLoading, error } = useNodeLearnContent(planId, node.node_id, true, nodeStatus);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  // Reset expanded sections when node changes
  useEffect(() => {
    setExpandedSections(new Set());
  }, [node.node_id]);

  // Loading state or preparing state with friendly message
  if ((isLoading || nodeStatus === 'pending') && !learnContent) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber/5 border border-amber/20">
          <div className="w-8 h-8 rounded-full bg-amber/20 flex items-center justify-center">
            <Play className="w-4 h-4 text-amber" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber">Resources are being prepared for this topic...</p>
            <p className="text-xs text-warm-400 mt-0.5">This usually takes 15-30 seconds</p>
          </div>
        </div>

        {/* Skeleton cards */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="flex gap-4">
              <div className="w-40 h-24 bg-hearth-700 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-hearth-700 rounded w-3/4" />
                <div className="h-3 bg-hearth-700 rounded w-1/2" />
                <div className="h-3 bg-hearth-700 rounded w-1/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        {/* Node objectives still show on error */}
        <div>
          <h4 className="font-heading text-sm font-semibold text-warm-50 mb-2">Learning Objectives</h4>
          <ul className="space-y-1.5">
            {node.objectives?.map((objective, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-warm-200">
                <span className="text-amber mt-0.5">•</span>
                {objective}
              </li>
            )) ?? <li className="text-sm text-warm-400">No objectives defined</li>}
          </ul>
        </div>

        <Card className="bg-red-500/10 border-red-500/30">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">Failed to load learn content</p>
                <p className="text-xs text-red-400/80 mt-1">{error.message || 'Please try again later'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Empty state (no content available)
  if (!learnContent || (learnContent.resources.length === 0 && !learnContent.reading_material?.sections?.length)) {
    return (
      <div className="space-y-4">
        {/* Node objectives */}
        <div>
          <h4 className="font-heading text-sm font-semibold text-warm-50 mb-2">Learning Objectives</h4>
          <ul className="space-y-1.5">
            {node.objectives?.map((objective, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-warm-200">
                <span className="text-amber mt-0.5">•</span>
                {objective}
              </li>
            )) ?? <li className="text-sm text-warm-400">No objectives defined</li>}
          </ul>
        </div>

        <Card className="bg-hearth-700/50">
          <CardContent className="py-8 text-center">
            <Play className="w-8 h-8 mx-auto text-warm-400 mb-2" />
            <p className="text-sm text-warm-400">No learning content available yet.</p>
            <p className="text-xs text-warm-600 mt-1">Content will be curated based on your topic.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Content loaded successfully
  const { resources, reading_material, cached } = learnContent;

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Cached indicator */}
      {cached && (
        <div className="flex items-center gap-2 text-xs text-warm-500">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          Content loaded from cache
        </div>
      )}

      {/* Node objectives */}
      <div>
        <h4 className="font-heading text-sm font-semibold text-warm-50 mb-2">Learning Objectives</h4>
        <ul className="space-y-1.5">
          {node.objectives?.map((objective, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-warm-200">
              <span className="text-amber mt-0.5">•</span>
              {objective}
            </li>
          )) ?? <li className="text-sm text-warm-400">No objectives defined</li>}
        </ul>
      </div>

      {/* YouTube resources */}
      {resources.length > 0 && (
        <div>
          <h4 className="font-heading text-sm font-semibold text-warm-50 mb-3">
            Recommended Videos
            <span className="ml-2 text-warm-400 font-normal">({resources.length})</span>
          </h4>

          <div className="space-y-3">
            {resources.map((resource) => (
              <VideoCard key={resource.video_id} resource={resource} />
            ))}
          </div>
        </div>
      )}

      {/* Reading material */}
      {reading_material && reading_material.sections.length > 0 && (
        <div>
          <h4 className="font-heading text-sm font-semibold text-warm-50 mb-3">
            Reading Material
            <span className="ml-2 text-warm-400 font-normal">({reading_material.sections.length} sections)</span>
          </h4>

          <div className="space-y-3">
            {reading_material.sections.map((section, index) => {
              const isExpanded = expandedSections.has(index);
              return (
                <Card key={index} className="bg-hearth-700/30 overflow-hidden">
                  <button
                    onClick={() => toggleSection(index)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-hearth-700/50 transition-colors"
                  >
                    <h5 className="font-medium text-sm text-warm-50">{section.heading}</h5>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-warm-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-warm-400 flex-shrink-0" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4">
                      <div className="text-sm text-warm-200 prose prose-invert prose-sm max-w-none">
                        <ContentRenderer content={section.content} />
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
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
      <Card className="overflow-hidden hover:shadow-lg hover:border-amber/30 transition-all">
        <div className="flex gap-4 p-3">
          {/* Thumbnail */}
          <div className="relative flex-shrink-0 w-40 h-24 rounded-lg overflow-hidden bg-hearth-700">
            <img
              src={resource.thumbnail_url}
              alt={resource.title || `${resource.channel} video thumbnail`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {/* Duration overlay */}
            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-hearth-900/80 text-warm-50 text-xs rounded font-mono">
              {formatSeconds(resource.duration_seconds)}
            </div>
            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-hearth-900/0 group-hover:bg-hearth-900/30 transition-colors">
              <div className="w-10 h-10 rounded-full bg-amber/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Play className="w-5 h-5 text-hearth-900 fill-current" />
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h5 className="font-medium text-sm text-warm-50 line-clamp-2 group-hover:text-amber transition-colors">
              {resource.title}
            </h5>
            <div className="flex items-center gap-3 mt-2 text-xs text-warm-400">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {resource.channel}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatSeconds(resource.duration_seconds)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" size="sm">
                {Math.round(resource.relevance_score * 100)}% match
              </Badge>
              <ExternalLink className="w-3 h-3 text-warm-400 group-hover:text-amber transition-colors" />
            </div>
          </div>
        </div>
      </Card>
    </a>
  );
}

/**
 * Escape HTML entities to prevent XSS attacks.
 * Converts dangerous characters to their HTML entity equivalents.
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * React-based markdown renderer for reading material content.
 * Handles basic formatting: bold, italic, code blocks, lists, headings, line breaks.
 * This is safe from XSS attacks as it escapes HTML entities before rendering.
 */
function ContentRenderer({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <>
      {lines.map((line, i) => {
        if (!line.trim()) return <br key={i} />;

        // Bullet lists
        const bulletMatch = line.match(/^\s*[-*]\s+(.*)/);
        if (bulletMatch) {
          return <li key={i} className="ml-4 list-disc">{renderInline(bulletMatch[1])}</li>;
        }

        // Headings
        const headingMatch = line.match(/^(#{2,3})\s+(.*)/);
        if (headingMatch) {
          const Tag = headingMatch[1].length === 2 ? 'h4' : 'h5';
          return <Tag key={i} className="font-semibold text-warm-50 mt-3 mb-1">{headingMatch[2]}</Tag>;
        }

        return <p key={i}>{renderInline(line)}</p>;
      })}
    </>
  );
}

/**
 * Parse inline markdown into safe React elements (no dangerouslySetInnerHTML).
 * Handles: code (backticks), bold (double asterisks), italic (single asterisk).
 */
function renderInline(text: string): React.ReactNode[] {
  // Order matters: check longer patterns first
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match (escaped)
    if (match.index > lastIndex) {
      parts.push(escapeHtml(text.slice(lastIndex, match.index)));
    }

    const token = match[0];

    if (token.startsWith('`')) {
      // Inline code - escape content, strip backticks
      parts.push(
        <code key={match.index} className="bg-hearth-900 px-1.5 py-0.5 rounded text-xs font-mono">
          {escapeHtml(token.slice(1, -1))}
        </code>
      );
    } else if (token.startsWith('**')) {
      // Bold - escape content, strip asterisks
      parts.push(<strong key={match.index}>{escapeHtml(token.slice(2, -2))}</strong>);
    } else if (token.startsWith('*')) {
      // Italic - escape content, strip asterisk
      parts.push(<em key={match.index}>{escapeHtml(token.slice(1, -1))}</em>);
    }

    lastIndex = match.index + token.length;
  }

  // Add remaining text (escaped)
  if (lastIndex < text.length) {
    parts.push(escapeHtml(text.slice(lastIndex)));
  }

  return parts.length > 0 ? parts : [escapeHtml(text)];
}
