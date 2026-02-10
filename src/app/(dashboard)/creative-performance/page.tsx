'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
  LinearProgress,
  Chip,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PercentIcon from '@mui/icons-material/Percent';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useQuery } from '@tanstack/react-query';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import TrendChart from '@/components/ui/TrendChart';

interface PartnerCreative {
  name: string;
  impressions: number;
  bids: number;
  wins: number;
  revenue: number;
  bidRequests: number;
  opportunities: number;
  winRate: number;
  renderRate: number;
  ecpm: number;
  bidRate: number;
}

interface CreativeData {
  summary: {
    totalImpressions: number;
    totalBids: number;
    totalWins: number;
    totalRevenue: number;
    totalBidRequests: number;
    overallWinRate: number;
    overallEcpm: number;
    overallBidRate: number;
  };
  partners: PartnerCreative[];
  dailyTrend: Array<{
    date: string;
    impressions: number;
    wins: number;
    revenue: number;
  }>;
  period: number;
}

type SortField = 'name' | 'impressions' | 'wins' | 'winRate' | 'revenue' | 'ecpm' | 'bidRate';
type SortDir = 'asc' | 'desc';

export default function CreativePerformancePage() {
  const [period, setPeriod] = useState(7);
  const [sortField, setSortField] = useState<SortField>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data, isLoading, error } = useQuery<CreativeData>({
    queryKey: ['creative-performance', period],
    queryFn: async () => {
      const res = await fetch(`/api/stats/creative?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch creative data');
      return res.json();
    },
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedPartners = [...(data?.partners || [])].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    const numA = Number(aVal);
    const numB = Number(bVal);
    return sortDir === 'asc' ? numA - numB : numB - numA;
  });

  if (isLoading) {
    return (
      <Box>
        <PageHeader title="Creative Performance" />
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
              <Skeleton variant="rounded" height={100} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={400} />
      </Box>
    );
  }

  const s = data?.summary || {
    totalImpressions: 0,
    totalBids: 0,
    totalWins: 0,
    totalRevenue: 0,
    totalBidRequests: 0,
    overallWinRate: 0,
    overallEcpm: 0,
    overallBidRate: 0,
  };

  const maxRevenue = sortedPartners.length > 0 ? Math.max(...sortedPartners.map((p) => p.revenue)) : 1;

  return (
    <Box>
      <PageHeader title="Creative Performance">
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

      <Alert
        severity="info"
        icon={<InfoOutlinedIcon />}
        sx={{ mb: 3, bgcolor: 'rgba(41,182,246,0.08)', border: '1px solid rgba(41,182,246,0.2)' }}
      >
        <Typography variant="body2">
          <strong>Demand Partner Creative Proxy</strong> &mdash; Creative-level data (individual ad creatives)
          is not available in the current Limelight sync. This view aggregates performance metrics per demand partner
          as a proxy for creative performance. Win rate (wins/bids) indicates how competitive each partner&apos;s creatives are.
        </Typography>
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load creative performance data.
        </Alert>
      )}

      {/* Summary KPIs */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Impressions"
            value={s.totalImpressions}
            icon={<VisibilityIcon />}
            format="number"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Wins"
            value={s.totalWins}
            icon={<EmojiEventsIcon />}
            format="number"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Overall Win Rate"
            value={s.overallWinRate}
            icon={<PercentIcon />}
            format="percent"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Overall eCPM"
            value={s.overallEcpm}
            icon={<AttachMoneyIcon />}
            format="currency"
          />
        </Grid>
      </Grid>

      {/* Daily Trend */}
      {data?.dailyTrend && data.dailyTrend.length > 0 && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Daily Impressions &amp; Wins
            </Typography>
            <TrendChart
              data={data.dailyTrend.map(day => ({
                date: new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                impressions: day.impressions,
                wins: day.wins,
              }))}
              xKey="date"
              yKeys={[
                { key: 'impressions', color: '#6366F1', name: 'Impressions' },
                { key: 'wins', color: '#00D9A6', name: 'Wins' },
              ]}
              height={300}
              formatTooltip={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}K` : v.toLocaleString()}
            />
          </CardContent>
        </Card>
      )}

      {/* Partner Performance Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Performance by Demand Partner
          </Typography>
          {sortedPartners.length === 0 ? (
            <EmptyState
              title="No data available"
              subtitle="Sync Limelight data first."
            />
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <TableSortLabel
                        active={sortField === 'name'}
                        direction={sortField === 'name' ? sortDir : 'asc'}
                        onClick={() => handleSort('name')}
                      >
                        Partner
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={sortField === 'impressions'}
                        direction={sortField === 'impressions' ? sortDir : 'desc'}
                        onClick={() => handleSort('impressions')}
                      >
                        Impressions
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={sortField === 'wins'}
                        direction={sortField === 'wins' ? sortDir : 'desc'}
                        onClick={() => handleSort('wins')}
                      >
                        Wins
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={sortField === 'winRate'}
                        direction={sortField === 'winRate' ? sortDir : 'desc'}
                        onClick={() => handleSort('winRate')}
                      >
                        Win Rate
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={sortField === 'bidRate'}
                        direction={sortField === 'bidRate' ? sortDir : 'desc'}
                        onClick={() => handleSort('bidRate')}
                      >
                        Bid Rate
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={sortField === 'revenue'}
                        direction={sortField === 'revenue' ? sortDir : 'desc'}
                        onClick={() => handleSort('revenue')}
                      >
                        Revenue
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={sortField === 'ecpm'}
                        direction={sortField === 'ecpm' ? sortDir : 'desc'}
                        onClick={() => handleSort('ecpm')}
                      >
                        eCPM
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right" sx={{ minWidth: 120 }}>
                      Revenue Share
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedPartners.map((p, i) => {
                    const revenueShare = maxRevenue > 0 ? (p.revenue / maxRevenue) * 100 : 0;
                    return (
                      <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </TableCell>
                        <TableCell align="right">
                          {p.impressions.toLocaleString()}
                        </TableCell>
                        <TableCell align="right">
                          {p.wins.toLocaleString()}
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${p.winRate.toFixed(1)}%`}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              bgcolor: p.winRate >= 50
                                ? 'rgba(76,175,80,0.15)'
                                : p.winRate >= 20
                                  ? 'rgba(255,183,77,0.15)'
                                  : 'rgba(255,82,82,0.15)',
                              color: p.winRate >= 50
                                ? '#4CAF50'
                                : p.winRate >= 20
                                  ? '#FFB74D'
                                  : '#FF5252',
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          {p.bidRate.toFixed(1)}%
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          ${p.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell align="right">
                          ${p.ecpm.toFixed(2)}
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={revenueShare}
                              sx={{
                                flex: 1,
                                height: 6,
                                borderRadius: 3,
                                bgcolor: 'rgba(255,255,255,0.05)',
                                '& .MuiLinearProgress-bar': {
                                  borderRadius: 3,
                                  background: 'linear-gradient(90deg, #6366F1, #818CF8)',
                                },
                              }}
                            />
                          </Box>
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
