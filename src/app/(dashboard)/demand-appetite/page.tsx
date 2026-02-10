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
  Collapse,
  IconButton,
  LinearProgress,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import GroupsIcon from '@mui/icons-material/Groups';
import PercentIcon from '@mui/icons-material/Percent';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { useQuery } from '@tanstack/react-query';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';

interface PublisherBreakdown {
  name: string;
  revenue: number;
  impressions: number;
}

interface DemandPartner {
  name: string;
  revenue: number;
  impressions: number;
  bidRequests: number;
  bids: number;
  wins: number;
  opportunities: number;
  winRate: number;
  bidRate: number;
  avgBidPrice: number;
  timeoutRate: number;
  fillRate: number;
  topPublishers: PublisherBreakdown[];
}

interface DemandAppetiteData {
  period: number;
  summary: {
    totalPartners: number;
    avgWinRate: number;
    highestBidder: { name: string; avgBidPrice: number } | null;
    totalRevenue: number;
    totalImpressions: number;
  };
  demandPartners: DemandPartner[];
}

function PartnerRow({ partner, rank }: { partner: DemandPartner; rank: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow
        sx={{
          '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
          cursor: 'pointer',
        }}
        onClick={() => setOpen(!open)}
      >
        <TableCell sx={{ width: 40, pr: 0 }}>
          <IconButton size="small" sx={{ color: 'text.secondary' }}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="caption"
              sx={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: rank <= 3 ? 'primary.main' : 'rgba(255,255,255,0.08)',
                color: rank <= 3 ? 'white' : 'text.secondary',
                fontSize: '0.7rem',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {rank}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                maxWidth: 220,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {partner.name}
            </Typography>
          </Box>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2" fontWeight={600}>
            ${partner.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2">
            {partner.impressions.toLocaleString()}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Chip
            label={`${partner.winRate.toFixed(1)}%`}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              bgcolor:
                partner.winRate >= 20
                  ? 'rgba(76, 175, 80, 0.15)'
                  : partner.winRate >= 10
                    ? 'rgba(255, 183, 77, 0.15)'
                    : 'rgba(255, 82, 82, 0.15)',
              color:
                partner.winRate >= 20
                  ? 'success.main'
                  : partner.winRate >= 10
                    ? 'warning.main'
                    : 'error.main',
            }}
          />
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2">
            {partner.bidRate.toFixed(1)}%
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2" fontWeight={500}>
            ${partner.avgBidPrice.toFixed(4)}
          </Typography>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={7} sx={{ py: 0, borderBottom: open ? undefined : 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2, px: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
                Top Publishers for {partner.name}
              </Typography>
              {partner.topPublishers.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No publisher breakdown available.
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {partner.topPublishers.map((pub, idx) => {
                    const maxRevenue = partner.topPublishers[0]?.revenue || 1;
                    const pct = (pub.revenue / maxRevenue) * 100;
                    return (
                      <Box key={idx}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              maxWidth: 300,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {pub.name}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 2 }}>
                            <Typography variant="body2" fontWeight={600}>
                              ${pub.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {pub.impressions.toLocaleString()} imps
                            </Typography>
                          </Box>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          sx={{
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
                    );
                  })}
                </Box>
              )}

              {/* Extra metrics row */}
              <Box sx={{ display: 'flex', gap: 3, mt: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Bid Requests
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {partner.bidRequests.toLocaleString()}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Bids
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {partner.bids.toLocaleString()}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Wins
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {partner.wins.toLocaleString()}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Fill Rate
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {partner.fillRate.toFixed(2)}%
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Timeout Rate
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{
                      color: partner.timeoutRate > 15 ? 'error.main' : 'text.primary',
                    }}
                  >
                    {partner.timeoutRate.toFixed(1)}%
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function DemandAppetitePage() {
  const [period, setPeriod] = useState<number>(7);

  const { data, isLoading } = useQuery<DemandAppetiteData>({
    queryKey: ['demand-appetite', period],
    queryFn: async () => {
      const res = await fetch(`/api/stats/demand-appetite?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch demand appetite data');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Demand Appetite
        </Typography>
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
              <Skeleton variant="rounded" height={110} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={400} />
      </Box>
    );
  }

  const d = data || {
    period: 7,
    summary: {
      totalPartners: 0,
      avgWinRate: 0,
      highestBidder: null,
      totalRevenue: 0,
      totalImpressions: 0,
    },
    demandPartners: [],
  };

  return (
    <Box>
      <PageHeader
        title="Demand Appetite"
        subtitle="Analyze demand partner bidding patterns and publisher preferences"
      >
        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={(_, v) => v !== null && setPeriod(v)}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              px: 2,
              py: 0.5,
              fontSize: '0.8rem',
              textTransform: 'none',
              '&.Mui-selected': {
                bgcolor: 'primary.main',
                color: 'white',
                '&:hover': { bgcolor: 'primary.dark' },
              },
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
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Demand Partners"
            value={d.summary.totalPartners.toString()}
            icon={<GroupsIcon />}
            subtitle={`Active in last ${d.period} days`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Avg Win Rate"
            value={`${d.summary.avgWinRate.toFixed(1)}%`}
            icon={<PercentIcon />}
            subtitle="Across all partners"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Highest Bidder"
            value={d.summary.highestBidder?.name || 'N/A'}
            icon={<EmojiEventsIcon />}
            subtitle={`$${d.summary.highestBidder?.avgBidPrice.toFixed(4) || '0.0000'} avg bid`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Total Revenue"
            value={`$${d.summary.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            icon={<TrendingUpIcon />}
            subtitle={`${d.summary.totalImpressions.toLocaleString()} impressions`}
          />
        </Grid>
      </Grid>

      {/* Demand Partners Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Demand Partner Appetites
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Click a row to expand and see top publishers for each partner
          </Typography>
          {d.demandPartners.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No data yet. Sync Limelight data to see demand partner appetites.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 40 }} />
                    <TableCell>Partner Name</TableCell>
                    <TableCell align="right">Revenue</TableCell>
                    <TableCell align="right">Impressions</TableCell>
                    <TableCell align="right">Win Rate</TableCell>
                    <TableCell align="right">Bid Rate</TableCell>
                    <TableCell align="right">Avg Bid Price</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.demandPartners.map((partner, idx) => (
                    <PartnerRow key={partner.name} partner={partner} rank={idx + 1} />
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
