'use client';

import { Box } from '@mui/material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface YKeyConfig {
  key: string;
  color: string;
  name?: string;
  gradientFill?: boolean;
}

interface TrendChartProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKeys: YKeyConfig[];
  height?: number;
  formatXAxis?: (value: string) => string;
  formatTooltip?: (value: number) => string;
  showLegend?: boolean;
}

export default function TrendChart({
  data,
  xKey,
  yKeys,
  height = 300,
  formatXAxis,
  formatTooltip,
  showLegend = true,
}: TrendChartProps) {
  if (!data || data.length === 0) return null;

  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            {yKeys.map((yk) => (
              <linearGradient
                key={`grad-${yk.key}`}
                id={`gradient-${yk.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={yk.color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={yk.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey={xKey}
            tick={{ fill: '#A1A1AA', fontSize: 12 }}
            tickFormatter={formatXAxis}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#A1A1AA', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatTooltip}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#3a3a3c',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: '#fff',
              fontSize: 13,
            }}
            formatter={(value, name) => {
              const v = (value as number) ?? 0;
              const formatted = formatTooltip ? formatTooltip(v) : v.toLocaleString();
              return [formatted, name ?? ''];
            }}
            labelFormatter={formatXAxis ? (label) => formatXAxis(String(label)) : undefined}
          />
          {showLegend && <Legend />}
          {yKeys.map((yk) => (
            <Area
              key={yk.key}
              type="monotone"
              dataKey={yk.key}
              stroke={yk.color}
              strokeWidth={2}
              fill={yk.gradientFill !== false ? `url(#gradient-${yk.key})` : 'transparent'}
              dot={false}
              name={yk.name || yk.key}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
}
