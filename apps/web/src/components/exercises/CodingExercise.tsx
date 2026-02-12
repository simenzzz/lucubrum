import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Loader2, Play, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CodingExercise as CodingExerciseType } from '@/types/api.types';

interface CodingExerciseProps {
  exercise: CodingExerciseType;
  answer: unknown;
  onAnswerChange: (answer: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  disabled: boolean;
  examMode?: boolean;
}

const LANGUAGE_MAP: Record<string, string> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  go: 'go',
  rust: 'rust',
};

export function CodingExercise({
  exercise,
  answer,
  onAnswerChange,
  onSubmit,
  isSubmitting,
  disabled,
  examMode,
}: CodingExerciseProps) {
  const [showTestCases, setShowTestCases] = useState(false);
  const { language: exerciseLanguage, test_cases, solution } = exercise.correct_answer;
  const code = (answer as string) || solution;
  const language = LANGUAGE_MAP[exerciseLanguage.toLowerCase()] || 'plaintext';

  return (
    <div className="space-y-4">
      {/* Question */}
      <div>
        <p className="text-warm-50 font-medium mb-2">{exercise.prompt}</p>
        <Badge variant="coding">{exerciseLanguage}</Badge>
      </div>

      {/* Code editor */}
      <div className="rounded-xl overflow-hidden border border-border-moderate">
        <Editor
          height="300px"
          language={language}
          value={code}
          onChange={(value) => onAnswerChange(value || '')}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            readOnly: disabled,
            wordWrap: 'on',
          }}
        />
      </div>

      {/* Test cases */}
      <div className="rounded-xl border border-border-moderate overflow-hidden">
        <button
          onClick={() => setShowTestCases(!showTestCases)}
          className="w-full flex items-center justify-between p-3 bg-hearth-700/50 hover:bg-hearth-700 transition-colors"
        >
          <span className="text-sm font-medium text-warm-50">
            Test Cases ({test_cases.length})
          </span>
          {showTestCases ? (
            <ChevronUp className="w-4 h-4 text-warm-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-warm-400" />
          )}
        </button>

        {showTestCases && (
          <div className="p-3 space-y-3 bg-hearth-800">
            {test_cases.map((testCase, index) => (
              <div
                key={index}
                className="p-3 rounded-lg bg-hearth-700/50 border border-border-subtle"
              >
                <div className="text-xs text-warm-400 mb-1">Test Case {index + 1}</div>
                <div className="space-y-1 font-mono text-sm">
                  <div className="flex gap-2">
                    <span className="text-warm-400">Input:</span>
                    <code className="text-lavender">{String(testCase.input)}</code>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-warm-400">Expected:</span>
                    <code className="text-sage">{String(testCase.output)}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit button */}
      {!examMode && (
        <Button
          onClick={onSubmit}
          disabled={!code.trim() || isSubmitting || disabled}
          variant="primary"
          className="w-full"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Running Tests...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Run & Submit
            </>
          )}
        </Button>
      )}
    </div>
  );
}
