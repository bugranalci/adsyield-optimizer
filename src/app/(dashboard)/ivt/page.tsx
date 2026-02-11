'use client';

import { useState, useEffect } from 'react';
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
  ToggleButtonGroup,
  ToggleButton,
  Button,
  CircularProgress,
  Chip,
  Select,
  MenuItem as MuiMenuItem,
  FormControl,
  InputLabel,
  Menu,
  MenuItem,
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import PercentIcon from '@mui/icons-material/Percent';
import BugReportIcon from '@mui/icons-material/BugReport';
import PsychologyIcon from '@mui/icons-material/Psychology';
import DownloadIcon from '@mui/icons-material/Download';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { IVTReportData } from '@/types';
import PageHeader from '@/components/ui/PageHeader';
import MetricCard from '@/components/ui/MetricCard';
import EmptyState from '@/components/ui/EmptyState';

function getRateColor(rate: number): string {
  if (rate < 10) return '#00D9A6';
  if (rate <= 20) return '#ff9800';
  return '#FF5252';
}

export default function IVTPage() {
  const [period, setPeriod] = useState(7);
  const [publisher, setPublisher] = useState<string>('');
  const [publisherList, setPublisherList] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);

  // Fetch publisher list for dropdown
  useEffect(() => {
    fetch('/api/ivt/report?publishers_list=true')
      .then((res) => res.json())
      .then((data) => {
        if (data.publishers) setPublisherList(data.publishers);
      })
      .catch(() => {});
  }, []);

  const { data, isLoading, isError, refetch } = useQuery<IVTReportData>({
    queryKey: ['ivt-report', period, publisher],
    queryFn: async () => {
      const params = new URLSearchParams({ period: String(period) });
      if (publisher) params.set('publisher', publisher);
      const res = await fetch(`/api/ivt/report?${params}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const handlePeriodChange = (_: React.MouseEvent<HTMLElement>, newPeriod: number | null) => {
    if (newPeriod !== null) setPeriod(newPeriod);
  };

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      await fetch('/api/ivt/analyze', { method: 'POST' });
      refetch();
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExportSummary = () => {
    setExportAnchor(null);
    const params = new URLSearchParams({ period: String(period), format: 'csv' });
    if (publisher) params.set('publisher', publisher);
    window.open(`/api/ivt/report?${params}`, '_blank');
  };

  const handleExportImpressions = () => {
    setExportAnchor(null);
    const params = new URLSearchParams({ period: String(period), export: 'impressions' });
    if (publisher) params.set('publisher', publisher);
    window.open(`/api/ivt/report?${params}`, '_blank');
  };

  // ---- Loading state ----
  if (isLoading) {
    return (
      <Box>
        <PageHeader title="IVT Monitoring" subtitle="Invalid Traffic detection and analysis" />

        <Grid container spacing={3} sx={{ mb: 4 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }} key={i}>
              <Skeleton variant="rounded" height={100} />
            </Grid>
          ))}
        </Grid>

        <Skeleton variant="rounded" height={360} sx={{ mb: 4 }} />

        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Skeleton variant="rounded" height={360} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Skeleton variant="rounded" height={360} />
          </Grid>
        </Grid>

        <Skeleton variant="rounded" height={300} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={300} />
      </Box>
    );
  }

  // ---- Error state ----
  if (isError) {
    return (
      <Box>
        <PageHeader title="IVT Monitoring" subtitle="Invalid Traffic detection and analysis" />
        <Card>
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <Typography color="error">
              Failed to load IVT data. Please try again later.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  const d = data || {
    summary: {
      totalImpressions: 0,
      suspiciousImpressions: 0,
      suspiciousRate: 0,
      givtCount: 0,
      sivtCount: 0,
      analyzedCount: 0,
      unanalyzedCount: 0,
    },
    topReasons: [],
    topSuspiciousIPs: [],
    topSuspiciousBundles: [],
    dailyTrend: [],
  };

  // ---- Empty state ----
  if (d.summary.totalImpressions === 0 && !publisher) {
    return (
      <Box>
        <PageHeader title="IVT Monitoring" subtitle="Invalid Traffic detection and analysis" />
        <EmptyState
          icon={<SecurityIcon sx={{ fontSize: 56 }} />}
          title="No IVT data available"
          subtitle="Data will appear after Limelight pixel integration is active."
        />
      </Box>
    );
  }

  const rateColor = getRateColor(d.summary.suspiciousRate);

  return (
    <Box>
      {/* ---- Header ---- */}
      <PageHeader title="IVT Monitoring" subtitle={`Invalid Traffic detection and analysis -- Last ${period} days${publisher ? ` -- Publisher: ${publisher}` : ''}`}>
        {/* Publisher filter */}
        {publisherList.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel sx={{ fontSize: '0.8rem' }}>Publisher</InputLabel>
            <Select
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              label="Publisher"
              sx={{ fontSize: '0.8rem' }}
            >
              <MuiMenuItem value="">All Publishers</MuiMenuItem>
              {publisherList.map((p) => (
                <MuiMenuItem key={p} value={p}>{p}</MuiMenuItem>
              ))}
            </Select>
          </FormControl>
        )}

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
          <ToggleButton value={7}>7D</ToggleButton>
          <ToggleButton value={14}>14D</ToggleButton>
          <ToggleButton value={30}>30D</ToggleButton>
        </ToggleButtonGroup>

        {/* Export dropdown */}
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={(e) => setExportAnchor(e.currentTarget)}
          sx={{ textTransform: 'none', fontSize: '0.8rem' }}
        >
          Export CSV
        </Button>
        <Menu
          anchorEl={exportAnchor}
          open={Boolean(exportAnchor)}
          onClose={() => setExportAnchor(null)}
        >
          <MenuItem onClick={handleExportSummary}>Export Summary</MenuItem>
          <MenuItem onClick={handleExportImpressions}>Export All Impressions</MenuItem>
        </Menu>

        <Button
          variant="contained"
          startIcon={isAnalyzing ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
          onClick={handleRunAnalysis}
          disabled={isAnalyzing}
          sx={{ textTransform: 'none' }}
        >
          {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
        </Button>
      </PageHeader>

      {/* ---- KPI Cards ---- */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <MetricCard
            title="Total Impressions"
            value={d.summary.totalImpressions}
            format="number"
            icon={<VisibilityIcon />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <MetricCard
            title="Suspicious"
            value={d.summary.suspiciousImpressions}
            format="number"
            icon={<ReportProblemIcon />}
            accentColor="#FF5252"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <MetricCard
            title="IVT Rate"
            value={d.summary.suspiciousRate}
            format="percent"
            icon={<PercentIcon />}
            accentColor={rateColor}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <MetricCard
            title="GIVT"
            value={d.summary.givtCount}
            format="number"
            icon={<BugReportIcon />}
            badge={
              <Chip
                label="General"
                size="small"
                sx={{
                  fontSize: '0.65rem',
                  height: 20,
                  bgcolor: 'rgba(99,102,241,0.15)',
                  color: '#6366F1',
                }}
              />
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <MetricCard
            title="SIVT"
            value={d.summary.sivtCount}
            format="number"
            icon={<PsychologyIcon />}
            badge={
              <Chip
                label="Sophisticated"
                size="small"
                sx={{
                  fontSize: '0.65rem',
                  height: 20,
                  bgcolor: 'rgba(255,82,82,0.15)',
                  color: '#FF5252',
                }}
              />
            }
          />
        </Grid>
      </Grid>

      {/* ---- Daily Trend Chart ---- */}
      {d.dailyTrend.length > 0 && (
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Daily IVT Trend
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={d.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fill: '#9AA0A6', fontSize: 12 }} />
                <YAxis tick={{ fill: '#9AA0A6', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#3a3a3c',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="#6366F1" strokeWidth={2} dot={false} name="Total" />
                <Line type="monotone" dataKey="suspicious" stroke="#FF5252" strokeWidth={2} dot={false} name="Suspicious" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ---- IVT Reasons + Analysis Status ---- */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                IVT Reasons Breakdown
              </Typography>
              {d.topReasons.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  No reason data available. Run analysis to generate breakdown.
                </Typography>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={d.topReasons} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" tick={{ fill: '#9AA0A6', fontSize: 12 }} />
                    <YAxis dataKey="reason" type="category" tick={{ fill: '#9AA0A6', fontSize: 11 }} width={140} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#3a3a3c',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                      }}
                    />
                    <Bar dataKey="count" fill="#FF5252" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <SecurityIcon sx={{ color: '#6366F1' }} />
                <Typography variant="h6">Analysis Status</Typography>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Analyzed</Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {d.summary.analyzedCount.toLocaleString()}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Unanalyzed</Typography>
                  <Typography variant="body1" fontWeight={600} sx={{ color: d.summary.unanalyzedCount > 0 ? '#ff9800' : 'text.primary' }}>
                    {d.summary.unanalyzedCount.toLocaleString()}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Coverage</Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {d.summary.totalImpressions > 0
                      ? ((d.summary.analyzedCount / d.summary.totalImpressions) * 100).toFixed(1)
                      : '0.0'}%
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={isAnalyzing ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing}
                  sx={{ textTransform: 'none' }}
                >
                  {isAnalyzing ? 'Running Analysis...' : 'Run Analysis'}
                </Button>
                {d.summary.unanalyzedCount > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                    {d.summary.unanalyzedCount.toLocaleString()} impressions pending analysis
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ---- Top Suspicious IPs ---- */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <WarningAmberIcon sx={{ color: '#FF5252' }} />
            <Typography variant="h6">Top Suspicious IPs</Typography>
          </Box>
          {d.topSuspiciousIPs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No suspicious IP data available.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>IP Address</TableCell>
                    <TableCell align="right">Suspicious Count</TableCell>
                    <TableCell align="right">Unique Bundles</TableCell>
                    <TableCell align="right">Risk</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.topSuspiciousIPs.map((ip, i) => (
                    <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {ip.ip}
                      </TableCell>
                      <TableCell align="right">{ip.count.toLocaleString()}</TableCell>
                      <TableCell align="right">{ip.uniqueBundles.toLocaleString()}</TableCell>
                      <TableCell align="right">
                        <Chip
                          label={ip.count >= 100 ? 'High' : ip.count >= 20 ? 'Medium' : 'Low'}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            height: 22,
                            bgcolor:
                              ip.count >= 100
                                ? 'rgba(255,82,82,0.15)'
                                : ip.count >= 20
                                  ? 'rgba(255,152,0,0.15)'
                                  : 'rgba(0,217,166,0.15)',
                            color:
                              ip.count >= 100
                                ? '#FF5252'
                                : ip.count >= 20
                                  ? '#ff9800'
                                  : '#00D9A6',
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* ---- Top Suspicious Bundles ---- */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <WarningAmberIcon sx={{ color: '#ff9800' }} />
            <Typography variant="h6">Top Suspicious Bundles</Typography>
          </Box>
          {d.topSuspiciousBundles.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No suspicious bundle data available.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Bundle</TableCell>
                    <TableCell align="right">Suspicious Count</TableCell>
                    <TableCell align="right">Suspicious Rate</TableCell>
                    <TableCell align="right">Risk</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.topSuspiciousBundles.map((bundle, i) => (
                    <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {bundle.bundle}
                      </TableCell>
                      <TableCell align="right">{bundle.count.toLocaleString()}</TableCell>
                      <TableCell align="right" sx={{ color: getRateColor(bundle.suspiciousRate) }}>
                        {bundle.suspiciousRate.toFixed(1)}%
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={bundle.suspiciousRate >= 20 ? 'High' : bundle.suspiciousRate >= 10 ? 'Medium' : 'Low'}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            height: 22,
                            bgcolor:
                              bundle.suspiciousRate >= 20
                                ? 'rgba(255,82,82,0.15)'
                                : bundle.suspiciousRate >= 10
                                  ? 'rgba(255,152,0,0.15)'
                                  : 'rgba(0,217,166,0.15)',
                            color:
                              bundle.suspiciousRate >= 20
                                ? '#FF5252'
                                : bundle.suspiciousRate >= 10
                                  ? '#ff9800'
                                  : '#00D9A6',
                          }}
                        />
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
