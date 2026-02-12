/**
 * OAuth callback handler page
 * Handles the redirect from Google OAuth
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/stores/uiStore';
import { getSafeErrorMessage } from '@/lib/utils';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { handleCallback } = useAuth();
  const { addToast } = useUIStore();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      setStatus('error');
      addToast({
        type: 'error',
        title: 'Authentication failed',
        message: errorDescription || 'Please try signing in again.',
      });
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    if (!code || !state) {
      setStatus('error');
      addToast({
        type: 'error',
        title: 'Invalid callback',
        message: 'Missing authentication parameters.',
      });
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    handleCallback(code, state)
      .then(() => {
        setStatus('success');
        addToast({
          type: 'success',
          title: 'Welcome aboard!',
          message: 'You are now signed in.',
        });
        setTimeout(() => navigate('/'), 500);
      })
      .catch((err) => {
        setStatus('error');
        addToast({
          type: 'error',
          title: 'Sign in failed',
          message: getSafeErrorMessage(err, 'Please try again.'),
        });
        setTimeout(() => navigate('/'), 2000);
      });
  }, [searchParams, handleCallback, addToast, navigate]);

  return (
    <div className="min-h-screen bg-hearth-900 flex items-center justify-center">
      <div className="text-center space-y-4">
        {status === 'processing' && (
          <>
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-amber/20 border-t-amber animate-spin" />
            </div>
            <p className="text-warm-200 font-heading">Signing you in...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-12 h-12 rounded-full bg-sage/20 flex items-center justify-center mx-auto">
              <div className="w-4 h-4 rounded-full bg-sage" />
            </div>
            <p className="text-warm-50 font-heading">Welcome!</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-12 h-12 rounded-full bg-rose/20 flex items-center justify-center mx-auto">
              <div className="w-4 h-4 rounded-full bg-rose" />
            </div>
            <p className="text-warm-50 font-heading">Authentication failed</p>
            <p className="text-sm text-warm-400">Redirecting you back...</p>
          </>
        )}
      </div>
    </div>
  );
}
