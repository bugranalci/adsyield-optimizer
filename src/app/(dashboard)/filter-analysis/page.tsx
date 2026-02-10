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
  Chip,
  LinearProgress,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BlockIcon from '@mui/icons-material/Block';
import TimerOffIcon from '@mui/icons-material/TimerOff';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { useQuery } from '@tanstack/react-query';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';

interface PartnerFilter {
  name: string;
  bidRequests: number;
  bids: number;
  wins: number;
  impressions: number;
  timeouts: number;
  errors: number;
  revenue: number;
  lossRate: number;
  timeoutRate: number;
  bidResponseRate: number;
  fillRate: number;
  timeoutRevenueLoss: number;
  lostBids: number;
  lostBidRevenue: number;
}

interface FilterData {
  summary: {
    totalBidRequests: number;
    totalBids: number;
    totalWins: number;
    totalImpressions: number;
    totalTimeouts: number;
    totalErrors: number;
    totalLostBids: number;
    estimatedLostRevenue: number;
    overallLossRate: number;
    averageEcpm: number;
  };
  partners: PartnerFilter[];
  highBidLowWin: PartnerFilter[];
  highTimeouts: PartnerFilter[];
  period: number;
}

type SortField = 'name' | 'bidRequests' | 'bids' | 'wins' | 'impressions' | 'lossRate' | 'timeouts' | 'lostBidRevenue';
type SortDir = 'asc' | 'desc';

export default function FilterAnalysisPage() {
  const [period, setPeriod] = useState(7);
  const [sortField, setSortField] = useState<SortField>('lossRate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data, isLoading, error } = useQuery<FilterData>({
    queryKey: ['filter-analysis', period],
    queryFn: async () => {
      const res = await fetch(`/api/stats/filters?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch filter data');
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
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Filter Analysis
        </Typography>
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
    totalBidRequests: 0,
    totalBids: 0,
    totalWins: 0,
    totalImpressions: 0,
    totalTimeouts: 0,
    totalErrors: 0,
    totalLostBids: 0,
    estimatedLostRevenue: 0,
    overallLossRate: 0,
    averageEcpm: 0,
  };

  const formatNum = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  return (
    <Box>
      <PageHeader title="Filter Analysis">
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
          <strong>Opportunity Analysis</strong> &mdash; FILTER_REASON data is not available in the current sync.
          This view identifies lost opportunities by analyzing partners with high bid counts but low win rates (creative/bid filtering)
          and partners with high timeouts (request filtering). Loss rate = 1 - (impressions / bids).
        </Typography>
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load filter analysis data.
        </Alert>
      )}

      {/* Opportunity Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Estimated Lost Revenue"
            value={`$${s.estimatedLostRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            icon={<AttachMoneyIcon />}
            subtitle={`From ${formatNum(s.totalLostBids)} lost bids + ${formatNum(s.totalTimeouts)} timeouts`}
            accentColor="#FF5252"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Overall Loss Rate"
            value={`${s.overallLossRate.toFixed(1)}%`}
            icon={<TrendingDownIcon />}
            subtitle="Bids that did not become impressions"
            accentColor="#FFB74D"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Timeouts"
            value={formatNum(s.totalTimeouts)}
            icon={<TimerOffIcon />}
            subtitle={`${s.totalBidRequests > 0 ? ((s.totalTimeouts / s.totalBidRequests) * 100).toFixed(1) : '0'}% of bid requests`}
            accentColor="#29B6F6"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Errors"
            value={formatNum(s.totalErrors)}
            icon={<BlockIcon />}
            subtitle={`${s.totalBidRequests > 0 ? ((s.totalErrors / s.totalBidRequests) * 100).toFixed(1) : '0'}% of bid requests`}
            accentColor="#9E9E9E"
          />
        </Grid>
      </Grid>

      {/* High Bid Low Win Segment */}
      {data?.highBidLowWin && data.highBidLowWin.length > 0 && (
        <Card sx={{ mb: 3, borderLeft: '4px solid #FFB74D' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <WarningAmberIcon sx={{ color: '#FFB74D' }} />
              <Typography variant="h6">
                High Bids, Low Wins
              </Typography>
              <Chip
                label={`${data.highBidLowWin.length} partners`}
                size="small"
                sx={{ ml: 1, bgcolor: 'rgba(255,183,77,0.15)', color: '#FFB74D', fontWeight: 600 }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Partners bidding actively but losing most auctions. May indicate creative quality issues, price floor mismatches, or advertiser filtering.
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Partner</TableCell>
                    <TableCell align="right">Bids</TableCell>
                    <TableCell align="right">Impressions</TableCell>
                    <TableCell align="right">Loss Rate</TableCell>
                    <TableCell align="right">Est. Lost Revenue</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.highBidLowWin.slice(0, 10).map((p, i) => (
                    <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </TableCell>
                      <TableCell align="right">{p.bids.toLocaleString()}</TableCell>
                      <TableCell align="right">{p.impressions.toLocaleString()}</TableCell>
                      <TableCell align="right">
                        <Chip
                          label={`${p.lossRate.toFixed(1)}%`}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            bgcolor: 'rgba(255,82,82,0.15)',
                            color: '#FF5252',
                          }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ color: '#FFB74D', fontWeight: 600 }}>
                        ${p.lostBidRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* High Timeouts Segment */}
      {data?.highTimeouts && data.highTimeouts.length > 0 && (
        <Card sx={{ mb: 3, borderLeft: '4px solid #29B6F6' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <TimerOffIcon sx={{ color: '#29B6F6' }} />
              <Typography variant="h6">
                High Timeouts
              </Typography>
              <Chip
                label={`${data.highTimeouts.length} partners`}
                size="small"
                sx={{ ml: 1, bgcolor: 'rgba(41,182,246,0.15)', color: '#29B6F6', fontWeight: 600 }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Partners with timeout rate above 5%. Requests are being filtered before they can bid. Consider adjusting timeout thresholds or investigating connectivity.
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Partner</TableCell>
                    <TableCell align="right">Bid Requests</TableCell>
                    <TableCell align="right">Timeouts</TableCell>
                    <TableCell align="right">Timeout Rate</TableCell>
                    <TableCell align="right">Est. Revenue Loss</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.highTimeouts.slice(0, 10).map((p, i) => (
                    <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </TableCell>
                      <TableCell align="right">{p.bidRequests.toLocaleString()}</TableCell>
                      <TableCell align="right">{p.timeouts.toLocaleString()}</TableCell>
                      <TableCell align="right">
                        <Chip
                          label={`${p.timeoutRate.toFixed(1)}%`}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            bgcolor: p.timeoutRate >= 20
                              ? 'rgba(255,82,82,0.15)'
                              : 'rgba(255,183,77,0.15)',
                            color: p.timeoutRate >= 20
                              ? '#FF5252'
                              : '#FFB74D',
                          }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ color: '#29B6F6', fontWeight: 600 }}>
                        ${p.timeoutRevenueLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Full Partner Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            All Partners &mdash; Opportunity Analysis
          </Typography>
          {sortedPartners.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No data available. Sync Limelight data first.
            </Typography>
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
                        active={sortField === 'bidRequests'}
                        direction={sortField === 'bidRequests' ? sortDir : 'desc'}
                        onClick={() => handleSort('bidRequests')}
                      >
                        Bid Requests
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={sortField === 'bids'}
                        direction={sortField === 'bids' ? sortDir : 'desc'}
                        onClick={() => handleSort('bids')}
                      >
                        Bids
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
                        active={sortField === 'impressions'}
                        direction={sortField === 'impressions' ? sortDir : 'desc'}
                        onClick={() => handleSort('impressions')}
                      >
                        Impressions
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={sortField === 'lossRate'}
                        direction={sortField === 'lossRate' ? sortDir : 'desc'}
                        onClick={() => handleSort('lossRate')}
                      >
                        Loss Rate
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={sortField === 'timeouts'}
                        direction={sortField === 'timeouts' ? sortDir : 'desc'}
                        onClick={() => handleSort('timeouts')}
                      >
                        Timeouts
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right" sx={{ minWidth: 100 }}>
                      Loss Severity
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedPartners.map((p, i) => {
                    const maxLoss = Math.max(...sortedPartners.map((pp) => pp.lostBidRevenue + pp.timeoutRevenueLoss));
                    const lossSeverity = maxLoss > 0 ? ((p.lostBidRevenue + p.timeoutRevenueLoss) / maxLoss) * 100 : 0;
                    return (
                      <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name}
                        </TableCell>
                        <TableCell align="right">{p.bidRequests.toLocaleString()}</TableCell>
                        <TableCell align="right">{p.bids.toLocaleString()}</TableCell>
                        <TableCell align="right">{p.wins.toLocaleString()}</TableCell>
                        <TableCell align="right">{p.impressions.toLocaleString()}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${p.lossRate.toFixed(1)}%`}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              bgcolor: p.lossRate >= 50
                                ? 'rgba(255,82,82,0.15)'
                                : p.lossRate >= 20
                                  ? 'rgba(255,183,77,0.15)'
                                  : 'rgba(76,175,80,0.15)',
                              color: p.lossRate >= 50
                                ? '#FF5252'
                                : p.lossRate >= 20
                                  ? '#FFB74D'
                                  : '#4CAF50',
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          {p.timeouts.toLocaleString()}
                          {p.timeoutRate > 5 && (
                            <Typography
                              component="span"
                              variant="caption"
                              sx={{ ml: 0.5, color: '#FF5252' }}
                            >
                              ({p.timeoutRate.toFixed(1)}%)
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <LinearProgress
                            variant="determinate"
                            value={lossSeverity}
                            sx={{
                              height: 6,
                              borderRadius: 3,
                              bgcolor: 'rgba(255,255,255,0.05)',
                              '& .MuiLinearProgress-bar': {
                                borderRadius: 3,
                                bgcolor: lossSeverity >= 60
                                  ? '#FF5252'
                                  : lossSeverity >= 30
                                    ? '#FFB74D'
                                    : '#4CAF50',
                              },
                            }}
                          />
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
