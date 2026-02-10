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
  Chip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import VerifiedIcon from '@mui/icons-material/Verified';
import GroupsIcon from '@mui/icons-material/Groups';
import StarIcon from '@mui/icons-material/Star';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useQuery } from '@tanstack/react-query';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';

interface PublisherQuality {
  publisher: string;
  qualityScore: number;
  bidRate: number;
  winRate: number;
  fillRate: number;
  revenue: number;
  impressions: number;
  bidRequests: number;
  timeouts: number;
  trend: 'improving' | 'stable' | 'declining';
}

interface QualityData {
  summary: {
    avgQualityScore: number;
    totalPublishers: number;
    highQuality: number;
    lowQuality: number;
  };
  publishers: PublisherQuality[];
}

function QualityBadge({ score }: { score: number }) {
  let color: 'success' | 'warning' | 'error' = 'warning';
  let label = 'Medium';
  if (score > 70) {
    color = 'success';
    label = 'High';
  } else if (score < 40) {
    color = 'error';
    label = 'Low';
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" fontWeight={700}>
        {score.toFixed(1)}
      </Typography>
      <Chip
        label={label}
        size="small"
        color={color}
        sx={{ fontWeight: 600, fontSize: '0.7rem', height: 22 }}
      />
    </Box>
  );
}

function TrendIcon({ trend }: { trend: 'improving' | 'stable' | 'declining' }) {
  if (trend === 'improving') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <TrendingUpIcon sx={{ fontSize: 18, color: 'success.main' }} />
        <Typography variant="caption" sx={{ color: 'success.main' }}>
          Improving
        </Typography>
      </Box>
    );
  }
  if (trend === 'declining') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <TrendingDownIcon sx={{ fontSize: 18, color: 'error.main' }} />
        <Typography variant="caption" sx={{ color: 'error.main' }}>
          Declining
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <TrendingFlatIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
      <Typography variant="caption" color="text.secondary">
        Stable
      </Typography>
    </Box>
  );
}

export default function SupplyQualityPage() {
  const [period, setPeriod] = useState<number>(7);

  const { data, isLoading } = useQuery<QualityData>({
    queryKey: ['supply-quality', period],
    queryFn: async () => {
      const res = await fetch(`/api/stats/quality?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch supply quality data');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Supply Quality
        </Typography>
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
              <Skeleton variant="rounded" height={120} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={400} />
      </Box>
    );
  }

  const d = data || {
    summary: { avgQualityScore: 0, totalPublishers: 0, highQuality: 0, lowQuality: 0 },
    publishers: [],
  };

  return (
    <Box>
      <PageHeader
        title="Supply Quality"
        subtitle="Publisher quality scores based on bid rate, win rate, fill rate, and delivery success"
      >
        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={(_, v) => v !== null && setPeriod(v)}
          size="small"
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
            title="Avg Quality Score"
            value={d.summary.avgQualityScore.toFixed(1)}
            icon={<VerifiedIcon />}
            subtitle={`Last ${period} days`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Publishers Analyzed"
            value={d.summary.totalPublishers.toString()}
            icon={<GroupsIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="High Quality (>70)"
            value={d.summary.highQuality.toString()}
            icon={<StarIcon />}
            subtitle={
              d.summary.totalPublishers > 0
                ? `${((d.summary.highQuality / d.summary.totalPublishers) * 100).toFixed(0)}% of total`
                : undefined
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Low Quality (<40)"
            value={d.summary.lowQuality.toString()}
            icon={<WarningAmberIcon />}
            subtitle={
              d.summary.totalPublishers > 0
                ? `${((d.summary.lowQuality / d.summary.totalPublishers) * 100).toFixed(0)}% of total`
                : undefined
            }
          />
        </Grid>
      </Grid>

      {/* Publisher Quality Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Publisher Quality Scores
          </Typography>
          {d.publishers.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No data yet. Sync Limelight data to see supply quality metrics.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Publisher</TableCell>
                    <TableCell>Quality Score</TableCell>
                    <TableCell align="right">Revenue</TableCell>
                    <TableCell align="right">Impressions</TableCell>
                    <TableCell align="right">Bid Rate</TableCell>
                    <TableCell align="right">Win Rate</TableCell>
                    <TableCell align="right">Fill Rate</TableCell>
                    <TableCell>Trend</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.publishers.map((p, i) => (
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
                        {p.publisher}
                      </TableCell>
                      <TableCell>
                        <QualityBadge score={p.qualityScore} />
                      </TableCell>
                      <TableCell align="right">
                        ${p.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell align="right">{p.impressions.toLocaleString()}</TableCell>
                      <TableCell align="right">{p.bidRate.toFixed(2)}%</TableCell>
                      <TableCell align="right">{p.winRate.toFixed(2)}%</TableCell>
                      <TableCell align="right">{p.fillRate.toFixed(2)}%</TableCell>
                      <TableCell>
                        <TrendIcon trend={p.trend} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
