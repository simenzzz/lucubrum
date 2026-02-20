import { BookOpen, Dumbbell, GraduationCap } from 'lucide-react';
import { useRoadmapStore, type NodeTab } from '@/stores/roadmapStore';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LearningTab } from './tabs/LearningTab';
import { PracticeTab } from './tabs/PracticeTab';
import { ExamTab } from './tabs/ExamTab';
import type { PlanNode, NodeResourceStatus } from '@/types/api.types';

interface NodePopupProps {
  node: PlanNode;
  planId: string;
  isOpen: boolean;
  onClose: () => void;
  mastery: number;
  nodeStatus?: NodeResourceStatus;
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
  mastery,
  nodeStatus,
}: NodePopupProps) {
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

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent showClose={!isExamInProgress}>
        {/* Header */}
        <SheetHeader>
          <SheetTitle>{node.title}</SheetTitle>
          <SheetDescription className="sr-only">
            Details and learning resources for {node.title}
          </SheetDescription>

          {/* Node stats */}
          <div className="flex items-center gap-4 flex-wrap pt-1">
            <Badge variant="secondary">
              ~{node.estimated_minutes} min
            </Badge>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-warm-400">Mastery</span>
              <Progress value={mastery * 100} className="w-20" />
              <span className="text-xs font-mono text-warm-200">
                {Math.round(mastery * 100)}%
              </span>
            </div>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <SheetBody>
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="flex flex-col h-full"
          >
            <TabsList className="w-full grid grid-cols-3 mb-4 shrink-0">
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

            <TabsContent value="learn" className="mt-0">
              <LearningTab node={node} planId={planId} nodeStatus={nodeStatus} />
            </TabsContent>

            <TabsContent value="practice" className="mt-0">
              <PracticeTab node={node} planId={planId} mastery={mastery} />
            </TabsContent>

            <TabsContent value="exam" className="mt-0">
              <ExamTab node={node} planId={planId} mastery={mastery} />
            </TabsContent>
          </Tabs>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
