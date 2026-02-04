/**
 * Plan configuration form with illustrated level/size badges
 * Uses React Hook Form + Zod for validation
 */
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Compass, Map, Star, Zap, Mountain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LEVEL_BADGES, SIZE_BADGES } from '@/lib/utils';
import type { PlanFormData } from '@/types/plan.types';

const planSchema = z.object({
  topic: z.string().min(3, 'Topic must be at least 3 characters'),
  userLevel: z.enum(['beginner', 'intermediate', 'advanced'], {
    required_error: 'Please select your experience level',
  }),
  sizePreference: z.enum(['concise', 'standard', 'comprehensive'], {
    required_error: 'Please select your journey length',
  }),
});

interface PlanConfigFormProps {
  onSubmit: (data: PlanFormData) => void;
  isLoading?: boolean;
  topic: string;
  onTopicChange?: (topic: string) => void;
}

export function PlanConfigForm({
  onSubmit,
  isLoading = false,
  topic,
}: PlanConfigFormProps) {
  const form = useForm<z.infer<typeof planSchema>>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      topic,
      userLevel: undefined,
      sizePreference: 'standard',
    },
  });

  const handleSubmit = (data: z.infer<typeof planSchema>) => {
    // Type is compatible with PlanFormData after Zod validation
    onSubmit(data);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="w-full max-w-2xl mx-auto mt-8"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
          {/* Experience Level Selection */}
          <FormField
            control={form.control}
            name="userLevel"
            render={({ field }) => (
              <FormItem className="space-y-4">
                <FormLabel className="text-base font-heading text-ink">
                  What is your experience level?
                </FormLabel>
                <FormDescription className="text-ink/60">
                  This helps tailor the depth and pace of your journey
                </FormDescription>
                <FormControl>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(Object.values(LEVEL_BADGES)).map((badge) => (
                      <motion.label
                        key={badge.value}
                        htmlFor={`level-${badge.value}`}
                        className="cursor-pointer"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <input
                          {...field}
                          type="radio"
                          id={`level-${badge.value}`}
                          value={badge.value}
                          checked={field.value === badge.value}
                          className="sr-only"
                        />
                        <div
                          className={`
                            relative p-6 rounded-lg border-2 transition-all duration-200
                            ${
                              field.value === badge.value
                                ? 'border-gold bg-gold/10 shadow-md'
                                : 'border-gold/30 bg-parchment-dark/30 hover:border-gold/50'
                            }
                          `}
                        >
                          {/* Icon */}
                          <div className={`w-10 h-10 rounded-full ${badge.bgColor} flex items-center justify-center mb-3`}>
                            {badge.icon === 'compass' && <Compass className="h-5 w-5 text-forest" />}
                            {badge.icon === 'map' && <Map className="h-5 w-5 text-ocean" />}
                            {badge.icon === 'star' && <Star className="h-5 w-5 text-gold" />}
                          </div>

                          {/* Title */}
                          <h3 className={`font-heading font-semibold ${badge.color} mb-1`}>
                            {badge.label}
                          </h3>

                          {/* Description */}
                          <p className="text-xs text-ink/60">{badge.description}</p>

                          {/* Selection indicator */}
                          {field.value === badge.value && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute top-2 right-2 w-4 h-4 rounded-full bg-gold flex items-center justify-center"
                            >
                              <div className="w-2 h-2 rounded-full bg-ink" />
                            </motion.div>
                          )}
                        </div>
                      </motion.label>
                    ))}
                  </div>
                </FormControl>
              </FormItem>
            )}
          />

          {/* Journey Size Selection */}
          <FormField
            control={form.control}
            name="sizePreference"
            render={({ field }) => (
              <FormItem className="space-y-4">
                <FormLabel className="text-base font-heading text-ink">
                  How long is your voyage?
                </FormLabel>
                <FormDescription className="text-ink/60">
                  Choose the depth of your learning expedition
                </FormDescription>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Select journey length" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(SIZE_BADGES).map((badge) => (
                      <SelectItem key={badge.value} value={badge.value}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center">
                            {badge.icon === 'zap' && <Zap className="h-4 w-4 text-gold" />}
                            {badge.icon === 'compass' && <Compass className="h-4 w-4 text-gold" />}
                            {badge.icon === 'mountain' && <Mountain className="h-4 w-4 text-gold" />}
                          </div>
                          <div>
                            <div className="font-medium">{badge.label}</div>
                            <div className="text-xs text-ink/60">{badge.description}</div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          {/* Submit Button */}
          <motion.div
            className="flex justify-center"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={isLoading || !topic.trim()}
              className="h-14 px-12 text-lg shadow-lg"
            >
              {isLoading ? (
                <>
                  <motion.div
                    className="w-5 h-5 border-2 border-ink/20 border-t-ink rounded-full mr-2"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                  Charting Course...
                </>
              ) : (
                <>
                  <Compass className="w-5 h-5 mr-2" />
                  Chart My Course
                </>
              )}
            </Button>
          </motion.div>

          {/* Form error */}
          {form.formState.errors.root && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-terracotta text-center"
            >
              {form.formState.errors.root.message}
            </motion.p>
          )}
        </form>
      </Form>
    </motion.div>
  );
}
