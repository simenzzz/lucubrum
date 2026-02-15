/**
 * Main landing page - "Chart Your Course"
 * Combines Hero, TopicInput, and PlanConfigForm with full auth flow
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Hero } from '@/components/landing/Hero';
import { TopicInput } from '@/components/landing/TopicInput';
import { PlanConfigForm } from '@/components/landing/PlanConfigForm';
import { LoadingState } from '@/components/landing/LoadingState';
import { ErrorState } from '@/components/landing/ErrorState';
import { LandingSchema } from '@/components/landing/LandingSchema';
import { useCreatePlan } from '@/hooks/usePlan';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/stores/uiStore';
import type { PlanFormData } from '@/types/plan.types';

export function LandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useUIStore();
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();

  const [topic, setTopic] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createPlanMutation = useCreatePlan();

  // Handle logout notification (OAuth callback is handled by AuthCallbackPage)
  useEffect(() => {
    const logoutParam = searchParams.get('logout');

    if (logoutParam === 'true') {
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
    login();
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
              className="container mx-auto px-4 -mt-20"
            >
              <TopicInput
                value={topic}
                onChange={setTopic}
                onSubmit={handleTopicSubmit}
                autoFocus
              />

              {/* Sign in prompt if not authenticated */}
              {topic && !isAuthenticated && !authLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center mt-6"
                >
                  <button
                    onClick={handleLogin}
                    className="text-amber hover:text-amber/70 underline underline-offset-4 transition-colors"
                  >
                    Sign in to continue
                  </button>
                </motion.div>
              )}
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
                onTopicChange={setTopic}
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
                onRetry={() => setErrorMessage(null)}
                onChangeTopic={() => {
                  setErrorMessage(null);
                  setShowConfig(false);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Features Section */}
        {!showConfig && !isCreating && !errorMessage && (
          <motion.section
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="container mx-auto px-4 py-20"
          >
            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <FeatureCard
                icon="🗺️"
                title="Personalized Roadmaps"
                description="AI-generated learning paths tailored to your level and goals"
              />
              <FeatureCard
                icon="📚"
                title="Curated Resources"
                description="Expert-ranked YouTube videos for every learning milestone"
              />
              <FeatureCard
                icon="⚔️"
                title="Adaptive Challenges"
                description="Exercises that evolve with your growing mastery"
              />
            </div>
          </motion.section>
        )}
      </div>
    </>
  );
}

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="organic-card p-6 rounded-xl text-center border border-border-moderate"
    >
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="font-heading font-semibold text-warm-50 mb-2">{title}</h3>
      <p className="text-sm text-warm-200">{description}</p>
    </motion.div>
  );
}
