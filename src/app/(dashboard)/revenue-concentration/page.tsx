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
  LinearProgress,
} from '@mui/material';
import PieChartIcon from '@mui/icons-material/PieChart';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import GroupsIcon from '@mui/icons-material/Groups';
import { useQuery } from '@tanstack/react-query';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';

interface EntityDistribution {
  name: string;
  revenue: number;
  share: number;
}

interface ConcentrationSide {
  hhi: number;
  top5Share: number;
  top10Share: number;
  risk: 'low' | 'medium' | 'high';
  count: number;
  distribution: EntityDistribution[];
}

interface ConcentrationData {
  demand: ConcentrationSide;
  publisher: ConcentrationSide;
  overallRisk: 'low' | 'medium' | 'high';
  totalRevenue: number;
}

function RiskBadge({ risk }: { risk: 'low' | 'medium' | 'high' }) {
  const config = {
    low: { color: 'success' as const, label: 'Low Risk' },
    medium: { color: 'warning' as const, label: 'Medium Risk' },
    high: { color: 'error' as const, label: 'High Risk' },
  };
  const c = config[risk];
  return <Chip label={c.label} size="small" color={c.color} sx={{ fontWeight: 600, fontSize: '0.7rem', height: 22 }} />;
}

function ConcentrationTable({
  title,
  side,
}: {
  title: string;
  side: ConcentrationSide;
}) {
  let cumulative = 0;
  const maxRevenue = side.distribution.length > 0 ? side.distribution[0].revenue : 0;

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">{title}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              HHI: <strong>{side.hhi.toLocaleString()}</strong>
            </Typography>
            <RiskBadge risk={side.risk} />
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Top 5 Share: <strong>{side.top5Share.toFixed(1)}%</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Top 10 Share: <strong>{side.top10Share.toFixed(1)}%</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Total Entities: <strong>{side.count}</strong>
          </Typography>
        </Box>

        {side.distribution.length === 0 ? (
          <EmptyState
            title="No data yet"
            subtitle="Sync Limelight data to see concentration metrics."
          />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 50 }}>Rank</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                  <TableCell align="right" sx={{ width: 100 }}>
                    Share %
                  </TableCell>
                  <TableCell align="right" sx={{ width: 120 }}>
                    Cumulative %
                  </TableCell>
                  <TableCell sx={{ width: 140 }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {side.distribution.map((entity, i) => {
                  cumulative += entity.share;
                  return (
                    <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} color="text.secondary">
                          #{i + 1}
                        </Typography>
                      </TableCell>
                      <TableCell
                        sx={{
                          maxWidth: 250,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: 500,
                        }}
                      >
                        {entity.name}
                      </TableCell>
                      <TableCell align="right">
                        ${entity.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          fontWeight={entity.share > 20 ? 700 : 400}
                          sx={{ color: entity.share > 30 ? 'warning.main' : 'text.primary' }}
                        >
                          {entity.share.toFixed(1)}%
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="text.secondary">
                          {cumulative.toFixed(1)}%
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <LinearProgress
                          variant="determinate"
                          value={maxRevenue > 0 ? (entity.revenue / maxRevenue) * 100 : 0}
                          sx={{
                            height: 6,
                            borderRadius: 3,
                            bgcolor: 'rgba(255,255,255,0.05)',
                            '& .MuiLinearProgress-bar': {
                              borderRadius: 3,
                              background: 'linear-gradient(90deg, #6366F1, #818CF8)',
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
  );
}

export default function RevenueConcentrationPage() {
  const [period, setPeriod] = useState<number>(7);

  const { data, isLoading } = useQuery<ConcentrationData>({
    queryKey: ['revenue-concentration', period],
    queryFn: async () => {
      const res = await fetch(`/api/stats/concentration?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch concentration data');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Box>
        <PageHeader title="Revenue Concentration" />
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
              <Skeleton variant="rounded" height={120} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={300} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={300} />
      </Box>
    );
  }

  const d = data || {
    demand: { hhi: 0, top5Share: 0, top10Share: 0, risk: 'low' as const, count: 0, distribution: [] },
    publisher: { hhi: 0, top5Share: 0, top10Share: 0, risk: 'low' as const, count: 0, distribution: [] },
    overallRisk: 'low' as const,
    totalRevenue: 0,
  };

  return (
    <Box>
      <PageHeader
        title="Revenue Concentration"
        subtitle="Revenue distribution analysis using Herfindahl-Hirschman Index (HHI) for concentration risk"
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
            title="Demand HHI"
            value={d.demand.hhi.toLocaleString()}
            icon={<AccountBalanceIcon />}
            subtitle={`${d.demand.count} demand partners`}
            badge={<RiskBadge risk={d.demand.risk} />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Publisher HHI"
            value={d.publisher.hhi.toLocaleString()}
            icon={<GroupsIcon />}
            subtitle={`${d.publisher.count} publishers`}
            badge={<RiskBadge risk={d.publisher.risk} />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Overall Risk Level"
            value={d.overallRisk.charAt(0).toUpperCase() + d.overallRisk.slice(1)}
            icon={<WarningAmberIcon />}
            subtitle={`$${d.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} total revenue`}
            badge={<RiskBadge risk={d.overallRisk} />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <MetricCard
            title="Top Partner Share"
            value={
              d.demand.distribution.length > 0
                ? `${d.demand.distribution[0].share.toFixed(1)}%`
                : '0%'
            }
            icon={<PieChartIcon />}
            subtitle={
              d.demand.distribution.length > 0
                ? d.demand.distribution[0].name
                : 'No data'
            }
          />
        </Grid>
      </Grid>

      {/* Demand Partner Concentration */}
      <Box sx={{ mb: 3 }}>
        <ConcentrationTable title="Demand Partner Concentration" side={d.demand} />
      </Box>

      {/* Publisher Concentration */}
      <ConcentrationTable title="Publisher Concentration" side={d.publisher} />
    </Box>
  );
}
