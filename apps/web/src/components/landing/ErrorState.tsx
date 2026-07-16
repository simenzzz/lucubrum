/**
 * Error state component for plan generation failures
 */
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CenteredState } from '@/components/layout/CenteredState';

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  onChangeTopic: () => void;
}

export function ErrorState({ message, onRetry, onChangeTopic }: ErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
      className="py-20"
    >
      <CenteredState
        icon={AlertCircle}
        title="Plan Generation Failed"
        message={`We couldn't generate your learning roadmap. ${message}`}
      >
        <Button variant="primary" onClick={onRetry}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
        <Button variant="outline" onClick={onChangeTopic}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Change Topic
        </Button>
      </CenteredState>
    </motion.div>
  );
}
