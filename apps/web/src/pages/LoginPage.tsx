/**
 * LoginPage — "Shape Your Path" authentication gateway
 *
 * Design: Arcane Cartography × Editorial Minimalism
 * ─────────────────────────────────────────────────
 * As if you're accessing a celestial navigation terminal before charting
 * a course through unknown territory. Left panel: atmospheric compass rose,
 * coordinate grid, ambient amber glow. Right panel: stark, minimal form.
 *
 * Typography: Cinzel (antique map / Roman inscription) loaded from Google Fonts
 * Motion:     Framer Motion split-panel entrance + spring tab indicator
 * Detail:     Slowly rotating compass SVG, bottom-border inputs, nautical copy
 */

import { forwardRef, useEffect, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { EmailLoginRequestSchema, EmailRegisterRequestSchema } from '@/types/schemas';

type LoginForm = z.infer<typeof EmailLoginRequestSchema>;
type RegisterFormValues = z.infer<typeof EmailRegisterRequestSchema>;

// ─── Decorative SVG ──────────────────────────────────────────────────────────

function CompassRose() {
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const angle = (i * 15 * Math.PI) / 180;
    const isMajor = i % 6 === 0;
    const isMid   = i % 3 === 0;
    const r1 = isMajor ? 74 : isMid ? 79 : 83;
    const x1 = 100 + r1 * Math.sin(angle);
    const y1 = 100 - r1 * Math.cos(angle);
    const x2 = 100 + 90 * Math.sin(angle);
    const y2 = 100 - 90 * Math.cos(angle);
    return { x1, y1, x2, y2, isMajor, isMid };
  });

  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Rings */}
      <circle cx="100" cy="100" r="90" stroke="rgb(251,191,36)" strokeWidth="0.5" strokeDasharray="3 9" />
      <circle cx="100" cy="100" r="70" stroke="rgb(251,191,36)" strokeWidth="0.3" opacity="0.5" />
      <circle cx="100" cy="100" r="50" stroke="rgb(251,191,36)" strokeWidth="0.3" opacity="0.35" />
      <circle cx="100" cy="100" r="30" stroke="rgb(251,191,36)" strokeWidth="0.5" opacity="0.55" />
      <circle cx="100" cy="100" r="5"  fill="rgb(251,191,36)" opacity="0.85" />

      {/* Axes */}
      <line x1="100" y1="8"   x2="100" y2="192" stroke="rgb(251,191,36)" strokeWidth="0.4" opacity="0.35" />
      <line x1="8"   y1="100" x2="192" y2="100" stroke="rgb(251,191,36)" strokeWidth="0.4" opacity="0.35" />
      <line x1="36"  y1="36"  x2="164" y2="164" stroke="rgb(251,191,36)" strokeWidth="0.25" opacity="0.18" />
      <line x1="164" y1="36"  x2="36"  y2="164" stroke="rgb(251,191,36)" strokeWidth="0.25" opacity="0.18" />

      {/* Cardinal pointers */}
      <polygon points="100,8 96.5,38 103.5,38"  fill="rgb(251,191,36)" opacity="0.75" />
      <polygon points="100,192 96.5,162 103.5,162" fill="rgb(251,191,36)" opacity="0.35" />
      <polygon points="8,100 38,96.5 38,103.5"   fill="rgb(251,191,36)" opacity="0.35" />
      <polygon points="192,100 162,96.5 162,103.5" fill="rgb(251,191,36)" opacity="0.35" />

      {/* Tick marks */}
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke="rgb(251,191,36)"
          strokeWidth={t.isMajor ? 0.9 : 0.35}
          opacity={t.isMajor ? 0.65 : t.isMid ? 0.4 : 0.25}
        />
      ))}
    </svg>
  );
}

// ─── Brand Icons ─────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

// ─── Form Field ──────────────────────────────────────────────────────────────

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, id, error, ...rest },
  ref
) {
  return (
    <div className="group">
      <label
        htmlFor={id}
        className="block text-[10px] tracking-[0.2em] uppercase text-warm-500 mb-2 transition-colors group-focus-within:text-amber/70"
      >
        {label}
      </label>
      <input
        id={id}
        ref={ref}
        className={[
          'w-full bg-transparent border-0 border-b py-2 text-sm text-warm-50',
          'placeholder:text-warm-600/50 outline-none transition-all duration-300',
          'focus:ring-0',
          error
            ? 'border-rose-500/50 focus:border-rose-400'
            : 'border-warm-400/20 focus:border-amber/60',
        ].join(' ')}
        {...rest}
      />
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-[10px] text-rose-400 mt-1.5 tracking-wide"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
});

// ─── OAuth Row ────────────────────────────────────────────────────────────────

function OAuthRow({ disabled }: { disabled: boolean }) {
  const { loginWithGoogle } = useAuthStore();

  return (
    <>
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-warm-400/10" />
        <span className="text-[9px] tracking-[0.25em] uppercase text-warm-600">or</span>
        <div className="flex-1 h-px bg-warm-400/10" />
      </div>

      <div className="grid grid-cols-1 gap-3">
        {[
          { label: 'Google', icon: <GoogleIcon />, action: loginWithGoogle },
        ].map(({ label, icon, action }) => (
          <button
            key={label}
            type="button"
            onClick={() => action()}
            disabled={disabled}
            className={[
              'flex items-center justify-center gap-2 py-2.5',
              'border border-warm-400/12 rounded-sm',
              'text-warm-400 text-[11px] tracking-[0.12em]',
              'hover:border-warm-400/28 hover:text-warm-200 hover:bg-white/[0.02]',
              'transition-all duration-200 disabled:opacity-40',
            ].join(' ')}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

// ─── Sign In Form ─────────────────────────────────────────────────────────────

function SignInForm({ onSuccess }: { onSuccess: () => void }) {
  const { loginWithEmail, isLoading, error, clearError } = useAuthStore();
  const { addToast } = useUIStore();
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(EmailLoginRequestSchema),
  });

  useEffect(() => { return () => { clearError(); }; }, [clearError]);

  const onSubmit = async (data: LoginForm) => {
    clearError();
    try {
      await loginWithEmail(data.email, data.password);
      addToast({ type: 'success', title: 'Welcome back.', message: 'Your path continues.' });
      onSuccess();
    } catch { /* error surfaced via store */ }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[11px] text-rose-400 tracking-wide border border-rose-500/20 bg-rose-500/5 rounded-sm px-3 py-2.5"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <Field
        label="Email address"
        id="si-email"
        type="email"
        placeholder="navigator@example.com"
        error={errors.email?.message}
        autoComplete="email"
        {...register('email')}
      />
      <Field
        label="Password"
        id="si-pass"
        type="password"
        placeholder="••••••••"
        error={errors.password?.message}
        autoComplete="current-password"
        {...register('password')}
      />

      <div className="pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className={[
            'w-full py-3 rounded-sm text-[11px] font-bold tracking-[0.2em] uppercase',
            'bg-amber text-hearth-900 relative overflow-hidden group',
            'hover:bg-amber/90 disabled:opacity-50 transition-colors duration-200',
          ].join(' ')}
        >
          <span className="relative z-10">{isLoading ? 'Navigating…' : 'Sign In'}</span>
          <motion.span
            className="absolute inset-0 bg-white/15"
            initial={{ y: '100%' }}
            whileHover={{ y: 0 }}
            transition={{ duration: 0.25 }}
          />
        </button>
      </div>

      <OAuthRow disabled={isLoading} />
    </form>
  );
}

// ─── Register Form ────────────────────────────────────────────────────────────

function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const { registerWithEmail, isLoading, error, clearError } = useAuthStore();
  const { addToast } = useUIStore();
  const { register, handleSubmit, formState: { errors } } = useForm<RegisterFormValues>({
    resolver: zodResolver(EmailRegisterRequestSchema),
  });

  useEffect(() => { return () => { clearError(); }; }, [clearError]);

  const onSubmit = async (data: RegisterFormValues) => {
    clearError();
    try {
      await registerWithEmail(data.email, data.name, data.password);
      addToast({ type: 'success', title: 'Path charted.', message: 'Your journey begins now.' });
      onSuccess();
    } catch { /* error surfaced via store */ }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[11px] text-rose-400 tracking-wide border border-rose-500/20 bg-rose-500/5 rounded-sm px-3 py-2.5"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <Field
        label="Full name"
        id="reg-name"
        placeholder="Your name"
        error={errors.name?.message}
        autoComplete="name"
        {...register('name')}
      />
      <Field
        label="Email address"
        id="reg-email"
        type="email"
        placeholder="navigator@example.com"
        error={errors.email?.message}
        autoComplete="email"
        {...register('email')}
      />
      <Field
        label="Password"
        id="reg-pass"
        type="password"
        placeholder="Min 8 chars · uppercase · number"
        error={errors.password?.message}
        autoComplete="new-password"
        {...register('password')}
      />
      <Field
        label="Confirm password"
        id="reg-confirm"
        type="password"
        placeholder="••••••••"
        error={errors.confirmPassword?.message}
        autoComplete="new-password"
        {...register('confirmPassword')}
      />

      <div className="pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className={[
            'w-full py-3 rounded-sm text-[11px] font-bold tracking-[0.2em] uppercase',
            'bg-amber text-hearth-900 relative overflow-hidden group',
            'hover:bg-amber/90 disabled:opacity-50 transition-colors duration-200',
          ].join(' ')}
        >
          <span className="relative z-10">{isLoading ? 'Charting course…' : 'Chart Your Path'}</span>
          <motion.span
            className="absolute inset-0 bg-white/15"
            initial={{ y: '100%' }}
            whileHover={{ y: 0 }}
            transition={{ duration: 0.25 }}
          />
        </button>
      </div>

      <OAuthRow disabled={isLoading} />
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'signin' | 'register'>('signin');
  const rawRedirect = searchParams.get('redirect') || '/';
  const redirectTo = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';

  // Redirect authenticated users immediately
  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  // Load Cinzel — an antique cartographic display font
  useEffect(() => {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&display=swap';
    document.head.appendChild(link);
    return () => { link.remove(); };
  }, []);

  const handleSuccess = () => navigate(redirectTo, { replace: true });

  return (
    <div className="min-h-screen bg-hearth-900 relative overflow-hidden flex">

      {/* ── Coordinate grid background ────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: [
            'linear-gradient(rgba(251,191,36,0.035) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(251,191,36,0.035) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '72px 72px',
        }}
      />

      {/* ── Ambient glow blooms ────────────────────────────── */}
      <div className="absolute bottom-[-80px] left-[15%] w-[500px] h-[500px] rounded-full bg-amber/[0.04] blur-[140px] pointer-events-none" />
      <div className="absolute top-[-60px] right-[-40px] w-72 h-72 rounded-full bg-amber/[0.03] blur-[100px] pointer-events-none" />

      {/* ════════════════════════════════════════════════════
          LEFT PANEL — atmospheric branding
          ════════════════════════════════════════════════════ */}
      <motion.div
        className="hidden lg:flex lg:w-[48%] flex-col items-center justify-center relative select-none"
        initial={{ opacity: 0, x: -32 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Slowly rotating compass */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            className="w-[520px] h-[520px] opacity-[0.22]"
            animate={{ rotate: 360 }}
            transition={{ duration: 200, repeat: Infinity, ease: 'linear' }}
          >
            <CompassRose />
          </motion.div>
        </div>

        {/* Corner viewfinder marks */}
        {(['top-7 left-7', 'top-7 right-7', 'bottom-7 left-7', 'bottom-7 right-7'] as const).map((pos, i) => (
          <div
            key={i}
            className={`absolute ${pos} w-6 h-6 border-amber/25 ${
              i === 0 ? 'border-l border-t'
              : i === 1 ? 'border-r border-t'
              : i === 2 ? 'border-l border-b'
              : 'border-r border-b'
            }`}
          />
        ))}

        {/* Branding content */}
        <div className="relative z-10 text-center px-10">
          {/* Amber pulse dot */}
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-amber mx-auto mb-8"
            animate={{ opacity: [1, 0.25, 1], scale: [1, 1.4, 1] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          />

          <h1
            className="text-[52px] font-semibold text-warm-50 leading-[1.05] mb-6"
            style={{ fontFamily: "'Cinzel', 'Georgia', serif", letterSpacing: '-0.01em' }}
          >
            Lucubrum
          </h1>

          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-8 h-px bg-amber/50" />
            <div className="w-1.5 h-1.5 rounded-full bg-amber/50" />
            <div className="w-8 h-px bg-amber/50" />
          </div>

          <p className="text-warm-400 text-[10px] tracking-[0.35em] uppercase mb-10">
            Shape Your Path
          </p>

          {/* Coordinate flavour text */}
          <div
            className="text-[9px] tracking-[0.2em] text-warm-600/40 space-y-1 font-mono"
          >
            <div>48°52′ N · 02°21′ E</div>
            <div>Chart No. 1 — Active</div>
          </div>
        </div>
      </motion.div>

      {/* Vertical divider */}
      <div className="hidden lg:block w-px self-stretch my-14 bg-gradient-to-b from-transparent via-amber/15 to-transparent" />

      {/* ════════════════════════════════════════════════════
          RIGHT PANEL — form
          ════════════════════════════════════════════════════ */}
      <motion.div
        className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 py-14"
        initial={{ opacity: 0, x: 32 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Mobile-only logo */}
        <div className="lg:hidden text-center mb-10">
          <h1
            className="text-3xl font-semibold text-warm-50 mb-2"
            style={{ fontFamily: "'Cinzel', 'Georgia', serif" }}
          >
            Lucubrum
          </h1>
          <p className="text-[9px] tracking-[0.3em] uppercase text-warm-500">
            Shape Your Path
          </p>
        </div>

        <div className="w-full max-w-[340px]">

          {/* ── Tab selector ──────────────────────────────── */}
          <div className="flex relative mb-9">
            {(['signin', 'register'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  'flex-1 pb-3 text-[10px] tracking-[0.2em] uppercase transition-colors duration-300',
                  activeTab === tab ? 'text-warm-50' : 'text-warm-600 hover:text-warm-400',
                ].join(' ')}
              >
                {tab === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}

            {/* Sliding amber underline */}
            <motion.div
              className="absolute bottom-0 h-px bg-amber"
              style={{ width: '50%' }}
              animate={{ left: activeTab === 'signin' ? '0%' : '50%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-warm-400/10" />
          </div>

          {/* ── Forms ─────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {activeTab === 'signin' ? (
              <motion.div
                key="signin"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <SignInForm onSuccess={handleSuccess} />
              </motion.div>
            ) : (
              <motion.div
                key="register"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <RegisterForm onSuccess={handleSuccess} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <motion.p
          className="text-[9px] text-warm-600/35 mt-10 tracking-[0.2em] uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          Bearing steady · Path clear
        </motion.p>
      </motion.div>
    </div>
  );
}
