'use client';

import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
} from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import PercentIcon from '@mui/icons-material/Percent';
import { useQuery } from '@tanstack/react-query';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import TrendChart from '@/components/ui/TrendChart';

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
    timeoutRate: number;
  }>;
  topPublishers: Array<{
    name: string;
    revenue: number;
    impressions: number;
    pubPayout: number;
    ecpm: number;
  }>;
  topBundles: Array<{
    bundle: string;
    revenue: number;
    impressions: number;
  }>;
  dailyTrend: Array<{
    date: string;
    revenue: number;
    impressions: number;
  }>;
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardData>({
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
        <PageHeader title="Dashboard" subtitle="Last 7 days performance overview" />
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

  const d = data || {
    totalRevenue: 0, totalImpressions: 0, avgECPM: 0, fillRate: 0,
    revenueChange: 0, impressionChange: 0, ecpmChange: 0, fillRateChange: 0,
    topPartners: [], topPublishers: [], topBundles: [], dailyTrend: [],
  };

  return (
    <Box>
      <PageHeader title="Dashboard" subtitle="Last 7 days performance overview" />

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Revenue"
            value={d.totalRevenue}
            change={d.revenueChange}
            changeLabel="vs prev 7 days"
            icon={<AttachMoneyIcon />}
            format="currency"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Impressions"
            value={d.totalImpressions}
            change={d.impressionChange}
            changeLabel="vs prev 7 days"
            icon={<VisibilityIcon />}
            format="number"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Avg eCPM"
            value={d.avgECPM}
            change={d.ecpmChange}
            changeLabel="vs prev 7 days"
            icon={<ShowChartIcon />}
            format="currency"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Fill Rate"
            value={d.fillRate}
            change={d.fillRateChange}
            changeLabel="vs prev 7 days"
            icon={<PercentIcon />}
            format="percent"
          />
        </Grid>
      </Grid>

      {/* Daily Revenue Trend */}
      {d.dailyTrend.length > 0 && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Daily Revenue Trend
            </Typography>
            <TrendChart
              data={d.dailyTrend.map(day => ({
                date: new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                revenue: day.revenue,
                impressions: day.impressions,
              }))}
              xKey="date"
              yKeys={[
                { key: 'revenue', color: '#6366F1', name: 'Revenue' },
                { key: 'impressions', color: '#00D9A6', name: 'Impressions' },
              ]}
              height={300}
              formatTooltip={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}K` : v.toLocaleString()}
            />
          </CardContent>
        </Card>
      )}

      {/* Top Partners & Publishers */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Top Demand Partners
              </Typography>
              {d.topPartners.length === 0 ? (
                <EmptyState
                  title="No partner data yet"
                  subtitle='Click "Sync Now" to fetch data from Limelight.'
                />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Partner</TableCell>
                        <TableCell align="right">Revenue</TableCell>
                        <TableCell align="right">Imps</TableCell>
                        <TableCell align="right">eCPM</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {d.topPartners.map((p, i) => (
                        <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                          <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                          </TableCell>
                          <TableCell align="right">${p.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                          <TableCell align="right">{p.impressions.toLocaleString()}</TableCell>
                          <TableCell align="right">${p.ecpm.toFixed(2)}</TableCell>
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
                Top Publishers
              </Typography>
              {d.topPublishers.length === 0 ? (
                <EmptyState
                  title="No publisher data yet"
                  subtitle="Data will appear after Limelight sync."
                />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Publisher</TableCell>
                        <TableCell align="right">Revenue</TableCell>
                        <TableCell align="right">eCPM</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {d.topPublishers.map((p, i) => (
                        <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                          <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                          </TableCell>
                          <TableCell align="right">${p.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                          <TableCell align="right">${p.ecpm.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Top Bundles */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Top Bundles by Revenue
          </Typography>
          {d.topBundles.length === 0 ? (
            <EmptyState
              title="No bundle data yet"
              subtitle="Data will appear after Limelight sync."
            />
          ) : (
            <Grid container spacing={2}>
              {d.topBundles.map((b, i) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.03)' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 200, fontWeight: 500 }}>
                        {b.bundle}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="primary" fontWeight={600}>
                        ${b.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {b.impressions.toLocaleString()} imps
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={d.topBundles[0] ? (b.revenue / d.topBundles[0].revenue) * 100 : 0}
                      sx={{
                        mt: 0.5,
                        height: 4,
                        borderRadius: 2,
                        bgcolor: 'rgba(255,255,255,0.05)',
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 2,
                          background: 'linear-gradient(90deg, #6366F1, #818CF8)',
                        },
                      }}
                    />
                  </Box>
                </Grid>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
