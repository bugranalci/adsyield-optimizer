'use client';

import { useState, useMemo } from 'react';
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
  TableSortLabel,
  TextField,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  Alert,
  LinearProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import InventoryIcon from '@mui/icons-material/Inventory';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import { useQuery } from '@tanstack/react-query';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BundleRow {
  bundle: string;
  impressions: number;
  revenue: number;
  bidRequests: number;
  bids: number;
  wins: number;
  opportunities: number;
  timeouts: number;
  errors: number;
  pubPayout: number;
  ecpm: number;
  fillRate: number;
  bidRate: number;
  winRate: number;
}

interface BundleSummary {
  totalBundles: number;
  totalRevenue: number;
  totalImpressions: number;
  avgECPM: number;
  overallFillRate: number;
}

interface BundleAPIResponse {
  bundles: BundleRow[];
  summary: BundleSummary;
  period: number;
  startDate: string;
  endDate: string;
}

type SortField = 'bundle' | 'revenue' | 'impressions' | 'ecpm' | 'bidRequests' | 'fillRate';
type SortDirection = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <Box>
      <PageHeader
        title="Bundle Analytics"
        subtitle="Loading bundle data from Limelight API..."
      />
      <LinearProgress
        sx={{
          mb: 3,
          borderRadius: 2,
          bgcolor: 'rgba(255,255,255,0.05)',
          '& .MuiLinearProgress-bar': {
            background: 'linear-gradient(90deg, #6366F1, #818CF8)',
          },
        }}
      />
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
            <Skeleton variant="rounded" height={100} />
          </Grid>
        ))}
      </Grid>
      <Card>
        <CardContent>
          <Skeleton variant="rounded" height={40} sx={{ mb: 2 }} />
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} variant="rounded" height={36} sx={{ mb: 1 }} />
          ))}
        </CardContent>
      </Card>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function BundlesPage() {
  const [period, setPeriod] = useState<number>(7);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('revenue');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { data, isLoading, isError, error } = useQuery<BundleAPIResponse>({
    queryKey: ['bundles', period],
    queryFn: async () => {
      const res = await fetch(`/api/stats/bundles?period=${period}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to fetch bundle data');
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes – API call is expensive
  });

  // Filter and sort bundles
  const filteredBundles = useMemo(() => {
    if (!data?.bundles) return [];

    let result = data.bundles;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((b) => b.bundle.toLowerCase().includes(q));
    }

    // Sort
    result = [...result].sort((a, b) => {
      let aVal: string | number = a[sortField];
      let bVal: string | number = b[sortField];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal);
      }

      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return result;
  }, [data?.bundles, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handlePeriodChange = (_: React.MouseEvent<HTMLElement>, newPeriod: number | null) => {
    if (newPeriod !== null) {
      setPeriod(newPeriod);
    }
  };

  // Loading state
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  // Error state
  if (isError) {
    return (
      <Box>
        <PageHeader title="Bundle Analytics" />
        <Alert severity="error" sx={{ mt: 2 }}>
          {(error as Error)?.message || 'Failed to load bundle analytics. The Limelight API may be temporarily unavailable.'}
        </Alert>
      </Box>
    );
  }

  const summary = data?.summary || {
    totalBundles: 0,
    totalRevenue: 0,
    totalImpressions: 0,
    avgECPM: 0,
    overallFillRate: 0,
  };

  return (
    <Box>
      {/* Header */}
      <PageHeader
        title="Bundle Analytics"
        subtitle={
          `Top performing app bundles over the last ${period} days` +
          (data?.startDate && data?.endDate ? ` \u2014 ${data.startDate} to ${data.endDate}` : '')
        }
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
              fontWeight: 600,
              borderColor: 'rgba(255,255,255,0.12)',
              '&.Mui-selected': {
                bgcolor: 'primary.main',
                color: '#fff',
                '&:hover': {
                  bgcolor: 'primary.dark',
                },
              },
            },
          }}
        >
          <ToggleButton value={7}>7 Days</ToggleButton>
          <ToggleButton value={14}>14 Days</ToggleButton>
          <ToggleButton value={30}>30 Days</ToggleButton>
        </ToggleButtonGroup>
      </PageHeader>

      {/* Slow-query note */}
      <Alert
        severity="info"
        variant="outlined"
        sx={{
          mb: 3,
          mt: 1,
          borderColor: 'rgba(41,182,246,0.3)',
          '& .MuiAlert-icon': { color: 'info.main' },
        }}
      >
        Bundle data is fetched directly from the Limelight API (not the synced database). Queries for longer periods may take a few seconds.
      </Alert>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Bundles"
            value={summary.totalBundles}
            icon={<InventoryIcon />}
            format="number"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Revenue"
            value={summary.totalRevenue}
            icon={<AttachMoneyIcon />}
            format="currency"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Impressions"
            value={summary.totalImpressions}
            icon={<VisibilityIcon />}
            format="number"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Avg eCPM"
            value={summary.avgECPM}
            icon={<ShowChartIcon />}
            format="currency"
          />
        </Grid>
      </Grid>

      {/* Table Card */}
      <Card>
        <CardContent>
          {/* Search bar */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <TextField
              size="small"
              placeholder="Search bundles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{
                minWidth: 280,
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'rgba(255,255,255,0.03)',
                },
              }}
            />
            <Chip
              label={`${filteredBundles.length} bundle${filteredBundles.length !== 1 ? 's' : ''} shown`}
              size="small"
              variant="outlined"
              sx={{ borderColor: 'rgba(255,255,255,0.12)' }}
            />
          </Box>

          {/* Data table */}
          {filteredBundles.length === 0 ? (
            <EmptyState
              title={searchQuery ? 'No bundles match your search' : 'No bundle data available'}
              subtitle={searchQuery ? 'Try a different search term.' : 'No bundle data available for this period.'}
            />
          ) : (
            <TableContainer sx={{ maxHeight: 620 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>
                      <TableSortLabel
                        active={sortField === 'bundle'}
                        direction={sortField === 'bundle' ? sortDirection : 'asc'}
                        onClick={() => handleSort('bundle')}
                      >
                        Bundle ID
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>
                      <TableSortLabel
                        active={sortField === 'revenue'}
                        direction={sortField === 'revenue' ? sortDirection : 'desc'}
                        onClick={() => handleSort('revenue')}
                      >
                        Revenue
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>
                      <TableSortLabel
                        active={sortField === 'impressions'}
                        direction={sortField === 'impressions' ? sortDirection : 'desc'}
                        onClick={() => handleSort('impressions')}
                      >
                        Impressions
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>
                      <TableSortLabel
                        active={sortField === 'ecpm'}
                        direction={sortField === 'ecpm' ? sortDirection : 'desc'}
                        onClick={() => handleSort('ecpm')}
                      >
                        eCPM
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>
                      <TableSortLabel
                        active={sortField === 'bidRequests'}
                        direction={sortField === 'bidRequests' ? sortDirection : 'desc'}
                        onClick={() => handleSort('bidRequests')}
                      >
                        Bid Requests
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, bgcolor: 'background.paper' }}>
                      <TableSortLabel
                        active={sortField === 'fillRate'}
                        direction={sortField === 'fillRate' ? sortDirection : 'desc'}
                        onClick={() => handleSort('fillRate')}
                      >
                        Fill Rate
                      </TableSortLabel>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredBundles.map((b, i) => {
                    // Revenue share bar relative to top bundle
                    const maxRevenue = filteredBundles[0]?.revenue || 1;
                    const revShare = (b.revenue / maxRevenue) * 100;

                    return (
                      <TableRow
                        key={b.bundle}
                        sx={{
                          '&:last-child td': { borderBottom: 0 },
                          '&:hover': { bgcolor: 'rgba(99,102,241,0.04)' },
                        }}
                      >
                        <TableCell
                          sx={{
                            maxWidth: 300,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                minWidth: 24,
                                fontWeight: 500,
                              }}
                            >
                              {i + 1}.
                            </Typography>
                            <Typography variant="body2" noWrap sx={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                              {b.bundle}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Box>
                            <Typography variant="body2" fontWeight={600} sx={{ color: 'secondary.main' }}>
                              ${b.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={revShare}
                              sx={{
                                mt: 0.5,
                                height: 3,
                                borderRadius: 1.5,
                                bgcolor: 'rgba(255,255,255,0.04)',
                                '& .MuiLinearProgress-bar': {
                                  borderRadius: 1.5,
                                  background: 'linear-gradient(90deg, #6366F1, #818CF8)',
                                },
                              }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {b.impressions.toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={500}>
                            ${b.ecpm.toFixed(2)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {b.bidRequests.toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${b.fillRate.toFixed(1)}%`}
                            size="small"
                            sx={{
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              minWidth: 58,
                              bgcolor:
                                b.fillRate >= 50
                                  ? 'rgba(76,175,80,0.15)'
                                  : b.fillRate >= 20
                                  ? 'rgba(255,183,77,0.15)'
                                  : 'rgba(255,82,82,0.12)',
                              color:
                                b.fillRate >= 50
                                  ? 'success.main'
                                  : b.fillRate >= 20
                                  ? 'warning.main'
                                  : 'error.main',
                              border: '1px solid',
                              borderColor:
                                b.fillRate >= 50
                                  ? 'rgba(76,175,80,0.3)'
                                  : b.fillRate >= 20
                                  ? 'rgba(255,183,77,0.3)'
                                  : 'rgba(255,82,82,0.25)',
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
