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
  Tooltip,
} from '@mui/material';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import VideocamIcon from '@mui/icons-material/Videocam';
import { useQuery } from '@tanstack/react-query';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';

interface AdSizeData {
  size: string;
  impressions: number;
  revenue: number;
  bidRequests: number;
  bids: number;
  wins: number;
  eCPM: number;
  fillRate: number;
}

interface AdSizeResponse {
  period: number;
  startDate: string;
  endDate: string;
  totalSizes: number;
  totalRevenue: number;
  totalImpressions: number;
  avgECPM: number;
  sizes: AdSizeData[];
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export default function AdSizePage() {
  const [period, setPeriod] = useState<number>(7);

  const { data, isLoading, isError } = useQuery<AdSizeResponse>({
    queryKey: ['ad-sizes', period],
    queryFn: async () => {
      const res = await fetch(`/api/stats/ad-sizes?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch ad size data');
      return res.json();
    },
  });

  const handlePeriodChange = (_: React.MouseEvent<HTMLElement>, newPeriod: number | null) => {
    if (newPeriod !== null) setPeriod(newPeriod);
  };

  if (isLoading) {
    return (
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Ad Size Analysis
        </Typography>
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {[1, 2, 3].map((i) => (
            <Grid size={{ xs: 12, sm: 4 }} key={i}>
              <Skeleton variant="rounded" height={100} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={400} />
      </Box>
    );
  }

  if (isError) {
    return (
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Ad Size Analysis
        </Typography>
        <Card>
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <Typography color="error">
              Failed to load ad size data. Please try again later.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  const d = data || {
    period: 7,
    startDate: '',
    endDate: '',
    totalSizes: 0,
    totalRevenue: 0,
    totalImpressions: 0,
    avgECPM: 0,
    sizes: [],
  };

  // Check if a size is the special 0X0 (video/interstitial)
  const isSpecialSize = (size: string) => size === '0X0' || size === '0x0';

  return (
    <Box>
      <PageHeader
        title="Ad Size Analysis"
        subtitle={`Performance breakdown by ad creative size (${d.startDate} to ${d.endDate})`}
      >
        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={handlePeriodChange}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              px: 2,
              py: 0.5,
              fontSize: '0.8rem',
              textTransform: 'none',
            },
          }}
        >
          <ToggleButton value={7}>7 Days</ToggleButton>
          <ToggleButton value={14}>14 Days</ToggleButton>
          <ToggleButton value={30}>30 Days</ToggleButton>
        </ToggleButtonGroup>
      </PageHeader>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <MetricCard
            title="Total Sizes"
            value={d.totalSizes.toString()}
            icon={<AspectRatioIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <MetricCard
            title="Total Revenue"
            value={formatCurrency(d.totalRevenue)}
            icon={<AttachMoneyIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <MetricCard
            title="Avg eCPM"
            value={formatCurrency(d.avgECPM)}
            icon={<ShowChartIcon />}
          />
        </Grid>
      </Grid>

      {/* Ad Size Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Ad Sizes by Revenue
          </Typography>
          {d.sizes.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No ad size data available. Data will appear after a Limelight sync.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Size</TableCell>
                    <TableCell align="right">Revenue</TableCell>
                    <TableCell align="right">Impressions</TableCell>
                    <TableCell align="right">eCPM</TableCell>
                    <TableCell align="right">Bid Requests</TableCell>
                    <TableCell align="right">Fill Rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.sizes.map((row, index) => {
                    const isSpecial = isSpecialSize(row.size);
                    return (
                      <TableRow
                        key={row.size}
                        sx={{
                          '&:last-child td': { borderBottom: 0 },
                          ...(isSpecial && {
                            bgcolor: 'rgba(99, 102, 241, 0.08)',
                            borderLeft: '3px solid',
                            borderColor: 'primary.main',
                          }),
                        }}
                      >
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {index + 1}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" fontWeight={isSpecial ? 700 : 500} sx={{ fontFamily: 'monospace' }}>
                              {row.size}
                            </Typography>
                            {isSpecial && (
                              <Tooltip title="Video / Interstitial ad with no fixed dimensions" arrow>
                                <Chip
                                  icon={<VideocamIcon sx={{ fontSize: 14 }} />}
                                  label="Video / Interstitial"
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                  sx={{ fontSize: '0.7rem', height: 22 }}
                                />
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600}>
                            {formatCurrency(row.revenue)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {formatNumber(row.impressions)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{
                              color: row.eCPM >= d.avgECPM ? 'success.main' : 'text.primary',
                              fontWeight: row.eCPM >= d.avgECPM ? 600 : 400,
                            }}
                          >
                            {formatCurrency(row.eCPM)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {formatNumber(row.bidRequests)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{
                              color: row.fillRate >= 50 ? 'success.main' : row.fillRate >= 20 ? 'warning.main' : 'error.main',
                            }}
                          >
                            {row.fillRate.toFixed(2)}%
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
