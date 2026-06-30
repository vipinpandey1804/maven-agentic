import {
  ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import { Empty } from './ui';

// brand-led palette (Maven orange first)
export const PALETTE = ['#ff5821', '#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9', '#ec4899'];

const grid = <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />;

// data: array of rows. For line/area/bar each row has `xKey` + one key per series.
// For pie each row is { name, value }.
export default function InsightChart({
  type = 'line', data = [], xKey = 'name', series = [{ key: 'value', label: 'Value', color: PALETTE[0] }],
  valueFormatter = (v) => v, height = 260, donut = false,
}) {
  if (!data || data.length === 0) return <Empty>Not enough data to chart yet</Empty>;
  // Bars read from a 0 baseline; line/area trends auto-scale around the data so
  // small month-to-month changes are visible instead of looking like a flat line.
  const yDomain = type === 'bar'
    ? [0, 'auto']
    : [(min) => Math.floor(min - Math.abs(min) * 0.05), (max) => Math.ceil(max + Math.abs(max) * 0.05)];
  const axes = (
    <>
      {grid}
      <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11}
        interval={0} angle={data.length > 6 ? -25 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 56 : 24} />
      <YAxis domain={yDomain} tickFormatter={valueFormatter} tickLine={false} axisLine={false} fontSize={12} width={64} />
      <Tooltip formatter={(v, n) => [valueFormatter(v), n]} />
      {series.length > 1 && <Legend />}
    </>
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      {type === 'line' ? (
        <LineChart data={data} margin={{ top: 6, right: 10, left: 6, bottom: 4 }}>
          {axes}
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color}
              strokeWidth={2.5} dot={{ r: 3 }} animationDuration={800} />
          ))}
        </LineChart>
      ) : type === 'area' ? (
        <AreaChart data={data} margin={{ top: 6, right: 10, left: 6, bottom: 4 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.03} />
              </linearGradient>
            ))}
          </defs>
          {axes}
          {series.map((s) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color}
              strokeWidth={2.5} fill={`url(#g-${s.key})`} animationDuration={800} />
          ))}
        </AreaChart>
      ) : type === 'bar' ? (
        <BarChart data={data} margin={{ top: 6, right: 10, left: 6, bottom: 4 }}>
          {axes}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[6, 6, 0, 0]} animationDuration={800} />
          ))}
        </BarChart>
      ) : (
        <PieChart>
          <Tooltip formatter={(v, n) => [valueFormatter(v), n]} />
          <Legend verticalAlign="bottom" align="center" iconType="circle" iconSize={9}
            wrapperStyle={{ fontSize: 11, paddingTop: 8, lineHeight: '18px' }} />
          <Pie data={data} dataKey="value" nameKey={xKey} cx="50%" cy="48%"
            innerRadius={donut ? 52 : 0} outerRadius={80} paddingAngle={2} animationDuration={800}
            labelLine={false}
            label={({ percent }) => (percent >= 0.08 ? `${Math.round(percent * 100)}%` : '')}>
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
        </PieChart>
      )}
    </ResponsiveContainer>
  );
}
