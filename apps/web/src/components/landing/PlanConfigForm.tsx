/**
 * Plan configuration form with warm dark radio cards
 * Uses React Hook Form + Zod for validation
 */
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Layers, Star, Zap, Mountain, Sparkles, Loader2 } from 'lucide-react';
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
  sizePreference: z.enum(['basic', 'moderate', 'large'], {
    required_error: 'Please select your path length',
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
      sizePreference: 'moderate',
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
                <FormLabel className="text-base font-heading text-warm-50">
                  What is your experience level?
                </FormLabel>
                <FormDescription className="text-warm-400">
                  This helps tailor the depth and pace of your learning
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
                            relative p-6 rounded-xl border-2 transition-all duration-200
                            ${
                              field.value === badge.value
                                ? 'border-amber bg-amber/10 shadow-glow-amber'
                                : 'border-border-moderate bg-hearth-700/30 hover:border-amber/50'
                            }
                          `}
                        >
                          {/* Icon */}
                          <div className={`w-10 h-10 rounded-full ${badge.bgColor} flex items-center justify-center mb-3`}>
                            {badge.icon === 'seedling' && <Sparkles className={`h-5 w-5 ${badge.color}`} />}
                            {badge.icon === 'layers' && <Layers className={`h-5 w-5 ${badge.color}`} />}
                            {badge.icon === 'star' && <Star className={`h-5 w-5 ${badge.color}`} />}
                          </div>

                          {/* Title */}
                          <h3 className={`font-heading font-semibold ${badge.color} mb-1`}>
                            {badge.label}
                          </h3>

                          {/* Description */}
                          <p className="text-xs text-warm-400">{badge.description}</p>

                          {/* Selection indicator */}
                          {field.value === badge.value && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber flex items-center justify-center"
                            >
                              <div className="w-2 h-2 rounded-full bg-hearth-900" />
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
                <FormLabel className="text-base font-heading text-warm-50">
                  How deep do you want to go?
                </FormLabel>
                <FormDescription className="text-warm-400">
                  Choose the scope of your learning path
                </FormDescription>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Select path length" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(SIZE_BADGES).map((badge) => (
                      <SelectItem key={badge.value} value={badge.value}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber/10 flex items-center justify-center">
                            {badge.icon === 'zap' && <Zap className="h-4 w-4 text-amber" />}
                            {badge.icon === 'layers' && <Layers className="h-4 w-4 text-amber" />}
                            {badge.icon === 'mountain' && <Mountain className="h-4 w-4 text-amber" />}
                          </div>
                          <div>
                            <div className="font-medium">{badge.label}</div>
                            <div className="text-xs text-warm-400">{badge.description}</div>
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
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Creating Roadmap...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Create My Roadmap
                </>
              )}
            </Button>
          </motion.div>

          {/* Form error */}
          {form.formState.errors.root && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-rose text-center"
            >
              {form.formState.errors.root.message}
            </motion.p>
          )}
        </form>
      </Form>
    </motion.div>
  );
}
