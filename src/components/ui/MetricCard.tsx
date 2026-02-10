'use client';

import { Box, Card, CardContent, Typography } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from 'recharts';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  format?: 'currency' | 'number' | 'percent' | 'string';
  change?: number;
  changeLabel?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  accentColor?: string;
  sparklineData?: number[];
}

function formatValue(v: number, format: string): string {
  if (format === 'currency') {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (format === 'percent') return `${v.toFixed(2)}%`;
  if (format === 'number') {
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toLocaleString();
  }
  return String(v);
}

export default function MetricCard({
  title,
  value,
  icon,
  format = 'string',
  change,
  changeLabel,
  subtitle,
  badge,
  accentColor,
  sparklineData,
}: MetricCardProps) {
  const displayValue = typeof value === 'number' && format !== 'string'
    ? formatValue(value, format)
    : String(value);

  const sparkData = sparklineData?.map((v, i) => ({ i, v }));

  return (
    <Card
      sx={{
        ...(accentColor && {
          borderLeft: `3px solid ${accentColor}`,
        }),
      }}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
            {title}
          </Typography>
          {icon && (
            <Box sx={{ color: 'text.secondary', opacity: 0.4 }}>{icon}</Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            {displayValue}
          </Typography>
          {badge}
        </Box>

        {change !== undefined && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
            {change >= 0 ? (
              <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
            ) : (
              <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
            )}
            <Typography
              variant="caption"
              sx={{ color: change >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}
            >
              {change >= 0 ? '+' : ''}{change.toFixed(1)}%
            </Typography>
            {changeLabel && (
              <Typography variant="caption" color="text.secondary">
                {changeLabel}
              </Typography>
            )}
          </Box>
        )}

        {subtitle && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {subtitle}
          </Typography>
        )}

        {sparkData && sparkData.length > 1 && (
          <Box sx={{ mt: 1.5, mx: -0.5 }}>
            <ResponsiveContainer width="100%" height={40}>
              <AreaChart data={sparkData}>
                <defs>
                  <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#6366F1"
                  strokeWidth={1.5}
                  fill="url(#sparkGradient)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
