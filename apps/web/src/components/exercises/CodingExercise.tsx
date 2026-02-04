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
  const code = (answer as string) || exercise.starter_code;
  const language = LANGUAGE_MAP[exercise.language.toLowerCase()] || 'plaintext';

  return (
    <div className="space-y-4">
      {/* Question */}
      <div>
        <p className="text-ink font-medium mb-2">{exercise.question}</p>
        <Badge variant="coding">{exercise.language}</Badge>
      </div>

      {/* Code editor */}
      <div className="rounded-lg overflow-hidden border border-gold/30">
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
      <div className="rounded-lg border border-gold/20 overflow-hidden">
        <button
          onClick={() => setShowTestCases(!showTestCases)}
          className="w-full flex items-center justify-between p-3 bg-parchment-dark/50 hover:bg-parchment-dark transition-colors"
        >
          <span className="text-sm font-medium text-ink">
            Test Cases ({exercise.test_cases.length})
          </span>
          {showTestCases ? (
            <ChevronUp className="w-4 h-4 text-ink/60" />
          ) : (
            <ChevronDown className="w-4 h-4 text-ink/60" />
          )}
        </button>

        {showTestCases && (
          <div className="p-3 space-y-3 bg-parchment">
            {exercise.test_cases.map((testCase, index) => (
              <div
                key={index}
                className="p-3 rounded-md bg-parchment-dark/50 border border-gold/10"
              >
                <div className="text-xs text-ink/50 mb-1">Test Case {index + 1}</div>
                <div className="space-y-1 font-mono text-sm">
                  <div className="flex gap-2">
                    <span className="text-ink/60">Input:</span>
                    <code className="text-ocean">{testCase.input}</code>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-ink/60">Expected:</span>
                    <code className="text-forest">{testCase.expected_output}</code>
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
