'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import PercentIcon from '@mui/icons-material/Percent';
import { useQuery } from '@tanstack/react-query';

interface DashboardData {
  totalRevenue: number;
  totalImpressions: number;
  avgECPM: number;
  fillRate: number;
  revenueChange: number;
  impressionChange: number;
  ecpmChange: number;
  fillRateChange: number;
  topPartners: Array<{
    name: string;
    revenue: number;
    impressions: number;
    ecpm: number;
    fillRate: number;
  }>;
  topBundles: Array<{
    bundle: string;
    revenue: number;
    impressions: number;
  }>;
}

function MetricCard({
  title,
  value,
  change,
  icon,
  format = 'number',
}: {
  title: string;
  value: number;
  change: number;
  icon: React.ReactNode;
  format?: 'currency' | 'number' | 'percent';
}) {
  const formatValue = (v: number) => {
    if (format === 'currency') return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (format === 'percent') return `${v.toFixed(1)}%`;
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return v.toFixed(2);
  };

  return (
    <Card>
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {title}
          </Typography>
          <Box sx={{ color: 'text.secondary', opacity: 0.5 }}>{icon}</Box>
        </Box>
        <Typography variant="h5" fontWeight={700}>
          {formatValue(value)}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
          {change >= 0 ? (
            <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
          ) : (
            <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
          )}
          <Typography
            variant="caption"
            sx={{ color: change >= 0 ? 'success.main' : 'error.main' }}
          >
            {change >= 0 ? '+' : ''}{change.toFixed(1)}%
          </Typography>
          <Typography variant="caption" color="text.secondary">
            vs last period
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/stats/dashboard');
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Dashboard
        </Typography>
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map((i) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
              <Skeleton variant="rounded" height={120} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  // Show placeholder if no data yet
  const d = data || {
    totalRevenue: 0,
    totalImpressions: 0,
    avgECPM: 0,
    fillRate: 0,
    revenueChange: 0,
    impressionChange: 0,
    ecpmChange: 0,
    fillRateChange: 0,
    topPartners: [],
    topBundles: [],
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Performance overview across all partners and bundles
      </Typography>

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Revenue"
            value={d.totalRevenue}
            change={d.revenueChange}
            icon={<AttachMoneyIcon />}
            format="currency"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Impressions"
            value={d.totalImpressions}
            change={d.impressionChange}
            icon={<VisibilityIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Avg eCPM"
            value={d.avgECPM}
            change={d.ecpmChange}
            icon={<ShowChartIcon />}
            format="currency"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Fill Rate"
            value={d.fillRate}
            change={d.fillRateChange}
            icon={<PercentIcon />}
            format="percent"
          />
        </Grid>
      </Grid>

      {/* Top Partners Table */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Top Demand Partners
              </Typography>
              {d.topPartners.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  No data yet. Click &quot;Sync Now&quot; to fetch data from Limelight.
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Partner</TableCell>
                        <TableCell align="right">Revenue</TableCell>
                        <TableCell align="right">Impressions</TableCell>
                        <TableCell align="right">eCPM</TableCell>
                        <TableCell align="right">Fill Rate</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {d.topPartners.slice(0, 10).map((p, i) => (
                        <TableRow key={i}>
                          <TableCell>{p.name}</TableCell>
                          <TableCell align="right">${p.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                          <TableCell align="right">{p.impressions.toLocaleString()}</TableCell>
                          <TableCell align="right">${p.ecpm.toFixed(2)}</TableCell>
                          <TableCell align="right">{p.fillRate.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Top Bundles
              </Typography>
              {d.topBundles.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  No data yet.
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {d.topBundles.slice(0, 8).map((b, i) => (
                    <Box key={i}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {b.bundle}
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          ${b.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={d.topBundles[0] ? (b.revenue / d.topBundles[0].revenue) * 100 : 0}
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          bgcolor: 'rgba(255,255,255,0.05)',
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 3,
                            background: 'linear-gradient(90deg, #6C63FF, #00D9A6)',
                          },
                        }}
                      />
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
