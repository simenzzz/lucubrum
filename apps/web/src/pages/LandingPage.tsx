/**
 * Main landing page - "Chart Your Course"
 * Combines Hero, TopicInput, and PlanConfigForm with full auth flow
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Hero } from '@/components/landing/Hero';
import { TopicInput } from '@/components/landing/TopicInput';
import { PlanConfigForm } from '@/components/landing/PlanConfigForm';
import { LoadingState } from '@/components/landing/LoadingState';
import { ErrorState } from '@/components/landing/ErrorState';
import { LandingSchema } from '@/components/landing/head/LandingSchema';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { ProductPreviewSection } from '@/components/landing/ProductPreviewSection';
import { OutcomesSection } from '@/components/landing/OutcomesSection';
import { FinalCtaSection } from '@/components/landing/FinalCtaSection';
import { useCreatePlan } from '@/hooks/usePlan';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/stores/uiStore';
import type { PlanFormData } from '@/types/plan.types';

const EXAMPLE_TOPICS = ['React Hooks', 'Linear Algebra', 'Renaissance Art', 'Machine Learning'];

export function LandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useUIStore();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [topic, setTopic] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Remembered so the error state's "Try Again" can re-submit the same request
  const [lastFormData, setLastFormData] = useState<PlanFormData | null>(null);

  const createPlanMutation = useCreatePlan();

  // Handle logout notification (OAuth callback is handled by AuthCallbackPage).
  // Ref guard: replaceState below doesn't update react-router's searchParams,
  // so StrictMode's double-effect would otherwise toast twice in dev.
  const logoutToastShown = useRef(false);
  useEffect(() => {
    const logoutParam = searchParams.get('logout');

    if (logoutParam === 'true' && !logoutToastShown.current) {
      logoutToastShown.current = true;
      addToast({
        type: 'info',
        title: 'Signed out',
        message: 'You have been signed out successfully.',
      });
      // Clear the URL parameter
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams, addToast]);

  const handleTopicSubmit = () => {
    if (topic.trim()) {
      if (!isAuthenticated) {
        // Trigger login
        addToast({
          type: 'info',
          title: 'Sign in required',
          message: 'Please sign in to create your learning roadmap.',
        });
        // Login will be triggered by user clicking the button that appears
      } else {
        setShowConfig(true);
      }
    }
  };

  const handlePlanSubmit = async (data: PlanFormData) => {
    if (!isAuthenticated) {
      addToast({
        type: 'info',
        title: 'Sign in required',
        message: 'Please sign in to create your learning roadmap.',
      });
      return;
    }

    setLastFormData(data);
    setErrorMessage(null);
    setIsCreating(true);

    try {
      const response = await createPlanMutation.mutateAsync({
        topic: topic.trim(),
        user_level: data.userLevel,
        plan_size: data.sizePreference,
      });

      addToast({
        type: 'success',
        title: 'Course charted!',
        message: 'Your learning roadmap is ready.',
      });

      // Navigate to roadmap
      navigate(`/roadmap/${response.plan_id}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.'
      );
      setIsCreating(false);
    }
  };

  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <>
      <LandingSchema topic={topic} />

      <div className="min-h-screen bg-hearth-900">
        {/* Hero Section */}
        {!showConfig && !isCreating && !errorMessage && <Hero />}

        {/* Main Content */}
        <AnimatePresence mode="wait">
          {!showConfig && !isCreating && !errorMessage && (
            <motion.div
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              id="topic-input"
              className="relative z-20 container mx-auto px-4 -mt-20"
            >
              <TopicInput
                value={topic}
                onChange={setTopic}
                onSubmit={handleTopicSubmit}
                autoFocus
              />

              {/* Example topics to try */}
              {!topic && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center gap-2 flex-wrap mt-5"
                >
                  <span className="text-xs text-warm-500 uppercase tracking-wide">Try:</span>
                  {EXAMPLE_TOPICS.map((exampleTopic) => (
                    <button
                      key={exampleTopic}
                      type="button"
                      onClick={() => setTopic(exampleTopic)}
                      className="px-3 py-1 rounded-full text-xs font-medium border border-border-moderate text-warm-300 hover:border-amber/50 hover:text-amber transition-colors"
                    >
                      {exampleTopic}
                    </button>
                  ))}
                </motion.div>
              )}

              {/* Sign in prompt if not authenticated */}
              {topic && !isAuthenticated && !authLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center mt-6"
                >
                  <Button variant="link" onClick={handleLogin} className="underline">
                    Sign in to continue
                  </Button>
                </motion.div>
              )}

              {/* Scroll cue to the explainer sections */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="text-center mt-10"
              >
                <a
                  href="#how-it-works"
                  className="inline-flex flex-col items-center gap-1 text-xs text-warm-400 hover:text-amber transition-colors"
                >
                  <span className="uppercase tracking-wide">See how it works</span>
                  <ChevronDown className="w-4 h-4 animate-bounce" style={{ animationDuration: '2s' }} />
                </a>
              </motion.div>
            </motion.div>
          )}

          {showConfig && !isCreating && !errorMessage && (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="container mx-auto px-4"
            >
              {/* Back button */}
              <button
                onClick={() => setShowConfig(false)}
                className="mb-6 text-warm-400 hover:text-warm-50 transition-colors flex items-center gap-2 text-sm"
              >
                ← Change topic
              </button>

              <PlanConfigForm
                onSubmit={handlePlanSubmit}
                isLoading={createPlanMutation.isPending}
                topic={topic}
              />
            </motion.div>
          )}

          {isCreating && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <LoadingState message="Generating your personalized learning roadmap..." />
            </motion.div>
          )}

          {errorMessage && !isCreating && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ErrorState
                message={errorMessage}
                onRetry={() => {
                  // Re-submit the same request; fall back to the config form if
                  // we somehow have no remembered data
                  if (lastFormData) {
                    void handlePlanSubmit(lastFormData);
                  } else {
                    setErrorMessage(null);
                  }
                }}
                onChangeTopic={() => {
                  setErrorMessage(null);
                  setShowConfig(false);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Explainer sections */}
        {!showConfig && !isCreating && !errorMessage && (
          <>
            <HowItWorksSection />
            <ProductPreviewSection />
            <OutcomesSection />
            <FinalCtaSection />
          </>
        )}
      </div>
    </>
  );
}
