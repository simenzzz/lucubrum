import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ProgressTimelineChartProps {
  data: Array<{
    date: string;
    mastery: number;
    nodesCompleted: number;
  }>;
}

export function ProgressTimelineChart({ data }: ProgressTimelineChartProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-lg">Mastery Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[250px] flex items-center justify-center text-warm-600">
            No progress data yet. Complete some exercises to see your journey.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="masteryGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D4A55A" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#D4A55A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 165, 90, 0.1)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fill: '#7D7268', fontSize: 12 }}
                axisLine={{ stroke: 'rgba(212, 165, 90, 0.2)' }}
              />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
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
                  name === 'mastery' ? `${value.toFixed(1)}%` : value,
                  name === 'mastery' ? 'Mastery' : 'Nodes Completed',
                ]}
                labelFormatter={formatDate}
              />
              <Area
                type="monotone"
                dataKey="mastery"
                stroke="#D4A55A"
                strokeWidth={2}
                fill="url(#masteryGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
