import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MasteryOverviewChartProps {
  data: {
    locked: number;
    available: number;
    inProgress: number;
    mastered: number;
  };
}

const COLORS = {
  locked: '#5C5349',     // warm dim gray
  available: '#D4A55A',  // amber
  inProgress: '#9488B2', // lavender
  mastered: '#8BA888',   // sage
};

const STATUS_LABELS = {
  locked: 'Locked',
  available: 'Available',
  inProgress: 'In Progress',
  mastered: 'Mastered',
};

export function MasteryOverviewChart({ data }: MasteryOverviewChartProps) {
  const chartData = [
    { name: STATUS_LABELS.mastered, value: data.mastered, color: COLORS.mastered },
    { name: STATUS_LABELS.inProgress, value: data.inProgress, color: COLORS.inProgress },
    { name: STATUS_LABELS.available, value: data.available, color: COLORS.available },
    { name: STATUS_LABELS.locked, value: data.locked, color: COLORS.locked },
  ].filter((item) => item.value > 0);

  const total = data.locked + data.available + data.inProgress + data.mastered;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-lg">Node Status Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="h-[250px] flex items-center justify-center text-warm-600">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [`${value} nodes`, 'Count']}
                contentStyle={{
                  backgroundColor: '#231F1B',
                  border: '1px solid rgba(212, 165, 90, 0.3)',
                  borderRadius: '12px',
                  color: '#F0EAE0',
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value) => (
                  <span className="text-sm text-warm-400">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-border-moderate">
          {Object.entries(data).map(([key, value]) => (
            <div key={key} className="text-center">
              <div
                className="w-3 h-3 rounded-full mx-auto mb-1"
                style={{ backgroundColor: COLORS[key as keyof typeof COLORS] }}
              />
              <div className="font-heading text-lg font-semibold text-warm-50">{value}</div>
              <div className="text-xs text-warm-400 capitalize">
                {STATUS_LABELS[key as keyof typeof STATUS_LABELS]}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
