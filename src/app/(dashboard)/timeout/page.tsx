'use client';

import { useState } from 'react';
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
  ToggleButton,
  ToggleButtonGroup,
  Chip,
} from '@mui/material';
import TimerOffIcon from '@mui/icons-material/TimerOff';
import PercentIcon from '@mui/icons-material/Percent';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useQuery } from '@tanstack/react-query';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import TrendChart from '@/components/ui/TrendChart';

interface PartnerTimeout {
  name: string;
  totalRequests: number;
  timeouts: number;
  errors: number;
  timeoutRate: number;
  errorRate: number;
  estimatedRevenueLoss: number;
  impressions: number;
  revenue: number;
}

interface DailyTrend {
  date: string;
  totalTimeouts: number;
  totalRequests: number;
  totalErrors: number;
  timeoutRate: number;
}

interface TimeoutData {
  summary: {
    totalTimeouts: number;
    avgTimeoutRate: number;
    estimatedRevenueLoss: number;
    totalErrors: number;
    totalRequests: number;
  };
  partners: PartnerTimeout[];
  dailyTrend: DailyTrend[];
  period: number;
}

function TimeoutRateChip({ rate }: { rate: number }) {
  let color: 'error' | 'warning' | 'success';
  if (rate > 10) {
    color = 'error';
  } else if (rate > 5) {
    color = 'warning';
  } else {
    color = 'success';
  }

  return (
    <Chip
      label={`${rate.toFixed(2)}%`}
      color={color}
      size="small"
      variant="outlined"
      sx={{ fontWeight: 600, minWidth: 72 }}
    />
  );
}

export default function TimeoutPage() {
  const [period, setPeriod] = useState<number>(7);

  const { data, isLoading } = useQuery<TimeoutData>({
    queryKey: ['timeouts', period],
    queryFn: async () => {
      const res = await fetch(`/api/stats/timeouts?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch timeout data');
      return res.json();
    },
  });

  const handlePeriodChange = (
    _event: React.MouseEvent<HTMLElement>,
    newPeriod: number | null
  ) => {
    if (newPeriod !== null) {
      setPeriod(newPeriod);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Box>
        <PageHeader title="Timeout Analysis" subtitle="Analyze bid response timeouts and errors across demand partners">
          <Skeleton variant="rounded" width={200} height={40} />
        </PageHeader>
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
              <Skeleton variant="rounded" height={100} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={400} sx={{ mb: 4 }} />
        <Skeleton variant="rounded" height={300} />
      </Box>
    );
  }

  const d = data || {
    summary: {
      totalTimeouts: 0,
      avgTimeoutRate: 0,
      estimatedRevenueLoss: 0,
      totalErrors: 0,
      totalRequests: 0,
    },
    partners: [],
    dailyTrend: [],
    period: 7,
  };

  return (
    <Box>
      {/* Header with period selector */}
      <PageHeader
        title="Timeout Analysis"
        subtitle={`Analyze bid response timeouts and errors across demand partners \u2014 Last ${d.period} days`}
      >
        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={handlePeriodChange}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              px: 2,
              py: 0.75,
              fontWeight: 600,
              fontSize: '0.8rem',
            },
          }}
        >
          <ToggleButton value={7}>7D</ToggleButton>
          <ToggleButton value={14}>14D</ToggleButton>
          <ToggleButton value={30}>30D</ToggleButton>
        </ToggleButtonGroup>
      </PageHeader>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Timeouts"
            value={d.summary.totalTimeouts}
            icon={<TimerOffIcon />}
            format="number"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Avg Timeout Rate"
            value={d.summary.avgTimeoutRate}
            icon={<PercentIcon />}
            format="percent"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Est. Revenue Loss"
            value={d.summary.estimatedRevenueLoss}
            icon={<AttachMoneyIcon />}
            format="currency"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Errors"
            value={d.summary.totalErrors}
            icon={<ErrorOutlineIcon />}
            format="number"
          />
        </Grid>
      </Grid>

      {/* Partner Timeout Table */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Timeout by Demand Partner
          </Typography>
          {d.partners.length === 0 ? (
            <EmptyState
              title="No timeout data available"
              subtitle="Data will appear after Limelight sync."
            />
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Partner</TableCell>
                    <TableCell align="right">Bid Requests</TableCell>
                    <TableCell align="right">Timeouts</TableCell>
                    <TableCell align="right">Timeout Rate</TableCell>
                    <TableCell align="right">Errors</TableCell>
                    <TableCell align="right">Error Rate</TableCell>
                    <TableCell align="right">Est. Rev Loss</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.partners.map((p, i) => (
                    <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell
                        sx={{
                          maxWidth: 220,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: 500,
                        }}
                      >
                        {p.name}
                      </TableCell>
                      <TableCell align="right">
                        {p.totalRequests.toLocaleString()}
                      </TableCell>
                      <TableCell align="right">
                        {p.timeouts.toLocaleString()}
                      </TableCell>
                      <TableCell align="right">
                        <TimeoutRateChip rate={p.timeoutRate} />
                      </TableCell>
                      <TableCell align="right">
                        {p.errors.toLocaleString()}
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            color: p.errorRate > 5 ? 'error.main' : 'text.primary',
                          }}
                        >
                          {p.errorRate.toFixed(2)}%
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            color: p.estimatedRevenueLoss > 100 ? 'error.main' : 'text.primary',
                            fontWeight: 500,
                          }}
                        >
                          ${p.estimatedRevenueLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Daily Timeout Trend */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Daily Timeout Trend
          </Typography>
          {d.dailyTrend.length === 0 ? (
            <EmptyState
              title="No daily trend data available"
              subtitle="Timeout trend data will appear after syncing."
            />
          ) : (
            <>
              {/* TrendChart replacing LinearProgress bars */}
              <Box sx={{ mb: 3 }}>
                <TrendChart
                  data={d.dailyTrend.map(day => ({
                    date: new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    }),
                    timeouts: day.totalTimeouts,
                    errors: day.totalErrors,
                  }))}
                  xKey="date"
                  yKeys={[
                    { key: 'timeouts', color: '#FF5252', name: 'Timeouts' },
                    { key: 'errors', color: '#FFB74D', name: 'Errors' },
                  ]}
                  height={300}
                  formatTooltip={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}K` : v.toLocaleString()}
                />
              </Box>

              {/* Detail table */}
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell align="right">Bid Requests</TableCell>
                      <TableCell align="right">Timeouts</TableCell>
                      <TableCell align="right">Errors</TableCell>
                      <TableCell align="right">Timeout Rate</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {d.dailyTrend.map((day) => (
                      <TableRow key={day.date} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell>
                          {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell align="right">
                          {day.totalRequests.toLocaleString()}
                        </TableCell>
                        <TableCell align="right">
                          {day.totalTimeouts.toLocaleString()}
                        </TableCell>
                        <TableCell align="right">
                          {day.totalErrors.toLocaleString()}
                        </TableCell>
                        <TableCell align="right">
                          <TimeoutRateChip rate={day.timeoutRate} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
