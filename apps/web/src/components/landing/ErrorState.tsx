/**
 * Error state component for plan generation failures
 */
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
      className="flex flex-col items-center justify-center py-20"
    >
      {/* Error icon with glow */}
      <div className="relative w-32 h-32 mb-8">
        <div className="absolute inset-0 bg-rose/10 rounded-full blur-xl" />
        <div className="relative w-full h-full flex items-center justify-center">
          <AlertCircle className="w-20 h-20 text-rose/60" />
        </div>
      </div>

      {/* Error message */}
      <div className="text-center space-y-2 max-w-md">
        <h2 className="text-2xl font-heading font-bold text-warm-50">
          Plan Generation Failed
        </h2>
        <p className="text-warm-200">
          We couldn't generate your learning roadmap. {message}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mt-8">
        <Button variant="primary" onClick={onRetry}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <Button variant="outline" onClick={onChangeTopic}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Change Topic
        </Button>
      </div>
    </motion.div>
  );
}
