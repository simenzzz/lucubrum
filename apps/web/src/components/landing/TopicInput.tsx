/**
 * Parchment-styled topic input component
 * Features gold glow on focus, parchment texture, and quill cursor
 */
import { forwardRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

// Validation constants
const MIN_TOPIC_LENGTH = 3;
const MAX_TOPIC_LENGTH = 200;

interface TopicInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
}

export const TopicInput = forwardRef<HTMLInputElement, TopicInputProps>(
  (
    {
      value,
      onChange,
      onSubmit,
      placeholder = 'What would you like to learn?',
      autoFocus = false,
      className,
      disabled = false,
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (value.trim() && onSubmit) {
        onSubmit();
      }
      return false;
    };

    return (
      <form onSubmit={handleSubmit} className={cn('relative w-full max-w-2xl mx-auto', className)}>
        <motion.div
          className="relative"
          animate={{
            scale: isFocused ? 1.01 : 1,
          }}
          transition={{ duration: 0.2 }}
        >
          {/* Parchment scroll styling */}
          <div className="relative">
            {/* Decorative scroll edges */}
            <div className="absolute -left-3 top-0 bottom-0 w-3 bg-gradient-to-r from-ink/10 to-transparent rounded-l" />
            <div className="absolute -right-3 top-0 bottom-0 w-3 bg-gradient-to-l from-ink/10 to-transparent rounded-r" />

            {/* Input wrapper with gold glow */}
            <div
              className={cn(
                'relative transition-all duration-300',
                isFocused && 'glow-gold'
              )}
            >
              <div className="relative flex items-center">
                {/* Search icon */}
                <div className="absolute left-4 text-ink/40 pointer-events-none">
                  {isFocused ? (
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ duration: 0.3, type: 'spring' }}
                    >
                      <Sparkles className="h-5 w-5 text-gold" />
                    </motion.div>
                  ) : (
                    <Search className="h-5 w-5" />
                  )}
                </div>

                {/* Input field */}
                <Input
                  ref={ref}
                  type="text"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  placeholder={placeholder}
                  disabled={disabled}
                  autoFocus={autoFocus}
                  maxLength={MAX_TOPIC_LENGTH}
                  minLength={MIN_TOPIC_LENGTH}
                  className={cn(
                    'h-14 pl-12 pr-4 text-base rounded-lg',
                    'bg-parchment-dark/50 border-2 border-gold/30',
                    'focus:border-gold focus:bg-parchment',
                    'placeholder:text-ink/40',
                    'transition-all duration-300'
                  )}
                />

                {/* Character count (shown when typing) */}
                {value.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      'absolute right-4 text-xs',
                      value.length >= MAX_TOPIC_LENGTH ? 'text-terracotta' : 'text-ink/40'
                    )}
                  >
                    {value.length}/{MAX_TOPIC_LENGTH}
                  </motion.div>
                )}
              </div>

              {/* Parchment texture overlay */}
              <div
                className="absolute inset-0 pointer-events-none rounded-lg opacity-30"
                style={{
                  backgroundImage: 'url(/textures/paper-noise.png)',
                  mixBlendMode: 'overlay',
                }}
              />
            </div>
          </div>

          {/* Decorative elements when focused */}
          {isFocused && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute -inset-1 -z-10 rounded-lg bg-gradient-to-r from-gold/0 via-gold/20 to-gold/0 blur-sm"
            />
          )}
        </motion.div>

        {/* Helper text */}
        {value.length === 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 text-sm text-ink/50 text-center"
          >
            Enter any topic you want to explore — from quantum physics to Renaissance art
          </motion.p>
        )}
      </form>
    );
  }
);

TopicInput.displayName = 'TopicInput';
