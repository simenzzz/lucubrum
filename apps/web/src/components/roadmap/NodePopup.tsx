import { BookOpen, Dumbbell, GraduationCap, X } from 'lucide-react';
import { useRoadmapStore, type NodeTab } from '@/stores/roadmapStore';
import { useIsMobile } from '@/hooks/useMediaQuery';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LearningTab } from './tabs/LearningTab';
import { PracticeTab } from './tabs/PracticeTab';
import { ExamTab } from './tabs/ExamTab';
import type { PlanNode, YouTubeResource } from '@/types/api.types';
import { cn } from '@/lib/utils';

interface NodePopupProps {
  node: PlanNode;
  planId: string;
  isOpen: boolean;
  onClose: () => void;
  resources: YouTubeResource[];
  mastery: number;
}

const TAB_CONFIG: { value: NodeTab; label: string; icon: React.ReactNode }[] = [
  { value: 'learn', label: 'Learn', icon: <BookOpen className="w-4 h-4" /> },
  { value: 'practice', label: 'Practice', icon: <Dumbbell className="w-4 h-4" /> },
  { value: 'exam', label: 'Exam', icon: <GraduationCap className="w-4 h-4" /> },
];

export function NodePopup({
  node,
  planId,
  isOpen,
  onClose,
  resources,
  mastery,
}: NodePopupProps) {
  const isMobile = useIsMobile();
  const { activeTab, setActiveTab, isExamInProgress } = useRoadmapStore();

  const handleTabChange = (value: string) => {
    // Don't allow tab change during exam
    if (isExamInProgress && value !== 'exam') {
      return;
    }
    setActiveTab(value as NodeTab);
  };

  const handleClose = () => {
    // Don't allow close during exam
    if (isExamInProgress) {
      return;
    }
    onClose();
  };

  // Difficulty badge variant
  const getDifficultyVariant = () => {
    if (node.difficulty <= 2) return 'easy';
    if (node.difficulty <= 3) return 'medium';
    return 'hard';
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          'max-h-[90vh] overflow-hidden flex flex-col',
          isMobile
            ? 'w-full h-[85vh] rounded-t-2xl rounded-b-none fixed bottom-0 top-auto translate-y-0 data-[state=open]:slide-in-from-bottom'
            : 'max-w-2xl'
        )}
      >
        {/* Header */}
        <DialogHeader className="flex-shrink-0 space-y-3 pb-4 border-b border-gold/20">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="font-heading text-xl text-ink pr-8">
                {node.title}
              </DialogTitle>
              <p className="text-sm text-ink/60 mt-1 line-clamp-2">
                {node.description}
              </p>
            </div>
            {!isExamInProgress && (
              <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogClose>
            )}
          </div>

          {/* Node stats */}
          <div className="flex items-center gap-4 flex-wrap">
            <Badge variant={getDifficultyVariant()}>
              Difficulty: {node.difficulty}/5
            </Badge>
            <Badge variant="secondary">
              ~{node.estimated_minutes} min
            </Badge>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-ink/50">Mastery</span>
              <Progress value={mastery * 100} className="w-20" />
              <span className="text-xs font-mono text-ink/70">
                {Math.round(mastery * 100)}%
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="flex-shrink-0 w-full grid grid-cols-3 mb-4">
            {TAB_CONFIG.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                disabled={isExamInProgress && tab.value !== 'exam'}
                className="flex items-center gap-2"
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 overflow-y-auto min-h-0 pr-1">
            <TabsContent value="learn" className="mt-0 h-full">
              <LearningTab node={node} resources={resources} />
            </TabsContent>

            <TabsContent value="practice" className="mt-0 h-full">
              <PracticeTab node={node} planId={planId} mastery={mastery} />
            </TabsContent>

            <TabsContent value="exam" className="mt-0 h-full">
              <ExamTab node={node} planId={planId} mastery={mastery} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
