import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ExerciseStatsChartProps {
  data: {
    mcq: { attempted: number; correct: number };
    shortAnswer: { attempted: number; correct: number };
    fillBlank: { attempted: number; correct: number };
    coding: { attempted: number; correct: number };
    flashcard: { attempted: number; correct: number };
  };
}

const TYPE_LABELS: Record<string, string> = {
  mcq: 'MCQ',
  shortAnswer: 'Short Answer',
  fillBlank: 'Fill Blank',
  coding: 'Coding',
  flashcard: 'Flashcard',
};

export function ExerciseStatsChart({ data }: ExerciseStatsChartProps) {
  const chartData = Object.entries(data).map(([type, stats]) => ({
    type: TYPE_LABELS[type] || type,
    attempted: stats.attempted,
    correct: stats.correct,
    accuracy: stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0,
  }));

  const totalAttempted = chartData.reduce((sum, item) => sum + item.attempted, 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-lg">Exercise Performance</CardTitle>
      </CardHeader>
      <CardContent>
        {totalAttempted === 0 ? (
          <div className="h-[250px] flex items-center justify-center text-warm-600">
            No exercises attempted yet. Start practicing to see your stats.
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 165, 90, 0.1)" />
                <XAxis
                  dataKey="type"
                  tick={{ fill: '#7D7268', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(212, 165, 90, 0.2)' }}
                />
                <YAxis
                  tick={{ fill: '#7D7268', fontSize: 12 }}
                  axisLine={{ stroke: 'rgba(212, 165, 90, 0.2)' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#231F1B',
                    border: '1px solid rgba(212, 165, 90, 0.3)',
                    borderRadius: '12px',
                    color: '#F0EAE0',
                  }}
                  formatter={(value: number, name: string) => [
                    value,
                    name === 'correct' ? 'Correct' : 'Attempted',
                  ]}
                />
                <Legend
                  formatter={(value) => (
                    <span className="text-sm text-warm-400 capitalize">{value}</span>
                  )}
                />
                <Bar dataKey="attempted" fill="#9488B2" radius={[4, 4, 0, 0]} />
                <Bar dataKey="correct" fill="#8BA888" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Accuracy summary */}
            <div className="grid grid-cols-5 gap-2 mt-4 pt-4 border-t border-border-moderate">
              {chartData.map((item) => (
                <div key={item.type} className="text-center">
                  <div className="font-heading text-lg font-semibold text-warm-50">
                    {item.accuracy}%
                  </div>
                  <div className="text-xs text-warm-400 truncate">{item.type}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
