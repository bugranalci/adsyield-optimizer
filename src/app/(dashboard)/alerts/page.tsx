'use client';

import { useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Skeleton,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useQuery } from '@tanstack/react-query';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';

interface AlertItem {
  type: 'performance' | 'revenue' | 'technical' | 'quality';
  severity: 'critical' | 'warning' | 'info';
  metric: string;
  partner: string;
  currentValue: number;
  previousValue: number;
  changePct: number;
  message: string;
}

interface AlertsResponse {
  generatedAt: string;
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
  alerts: AlertItem[];
}

const severityConfig = {
  critical: {
    color: '#f44336',
    bgColor: 'rgba(244, 67, 54, 0.08)',
    borderColor: 'rgba(244, 67, 54, 0.3)',
    icon: <ErrorOutlineIcon sx={{ color: '#f44336' }} />,
    label: 'Critical',
  },
  warning: {
    color: '#ff9800',
    bgColor: 'rgba(255, 152, 0, 0.08)',
    borderColor: 'rgba(255, 152, 0, 0.3)',
    icon: <WarningAmberIcon sx={{ color: '#ff9800' }} />,
    label: 'Warning',
  },
  info: {
    color: '#2196f3',
    bgColor: 'rgba(33, 150, 243, 0.08)',
    borderColor: 'rgba(33, 150, 243, 0.3)',
    icon: <InfoOutlinedIcon sx={{ color: '#2196f3' }} />,
    label: 'Info',
  },
};

function formatMetricValue(metric: string, value: number): string {
  if (metric === 'revenue') return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (metric === 'ecpm') return `$${value.toFixed(2)}`;
  if (metric === 'fill_rate' || metric === 'timeout_rate') return `${value.toFixed(1)}%`;
  return value.toLocaleString();
}

function formatMetricLabel(metric: string): string {
  const labels: Record<string, string> = {
    revenue: 'Revenue',
    ecpm: 'eCPM',
    fill_rate: 'Fill Rate',
    timeout_rate: 'Timeout Rate',
  };
  return labels[metric] || metric;
}

function AlertCard({ alert }: { alert: AlertItem }) {
  const config = severityConfig[alert.severity];
  const isNegativeChange = alert.changePct < 0;

  return (
    <Card
      sx={{
        bgcolor: config.bgColor,
        border: '1px solid',
        borderColor: config.borderColor,
        mb: 2,
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          {/* Severity icon */}
          <Box sx={{ mt: 0.3 }}>{config.icon}</Box>

          {/* Content */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Top row: severity badge + type + partner */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
              <Chip
                label={config.label}
                size="small"
                sx={{
                  bgcolor: config.color,
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  height: 22,
                }}
              />
              <Chip
                label={alert.type}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.7rem', height: 22, textTransform: 'capitalize' }}
              />
              <Typography variant="body2" fontWeight={600} noWrap>
                {alert.partner}
              </Typography>
            </Box>

            {/* Message */}
            <Typography variant="body2" sx={{ mb: 1.5, lineHeight: 1.5 }}>
              {alert.message}
            </Typography>

            {/* Metric change detail */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {formatMetricLabel(alert.metric)}:
                </Typography>
                <Typography variant="caption" fontWeight={600}>
                  {formatMetricValue(alert.metric, alert.previousValue)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  -&gt;
                </Typography>
                <Typography variant="caption" fontWeight={600}>
                  {formatMetricValue(alert.metric, alert.currentValue)}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {isNegativeChange ? (
                  <TrendingDownIcon sx={{ fontSize: 14, color: 'error.main' }} />
                ) : (
                  <TrendingUpIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                )}
                <Typography
                  variant="caption"
                  fontWeight={600}
                  sx={{ color: isNegativeChange ? 'error.main' : 'warning.main' }}
                >
                  {alert.changePct > 0 ? '+' : ''}{alert.changePct}%
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function AlertsPage() {
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const { data, isLoading, isError } = useQuery<AlertsResponse>({
    queryKey: ['alerts'],
    queryFn: async () => {
      const res = await fetch('/api/alerts');
      if (!res.ok) throw new Error('Failed to fetch alerts');
      return res.json();
    },
  });

  const handleFilterChange = (_: React.MouseEvent<HTMLElement>, newFilter: string | null) => {
    if (newFilter !== null) setSeverityFilter(newFilter);
  };

  if (isLoading) {
    return (
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Alerts Dashboard
        </Typography>
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {[1, 2, 3].map((i) => (
            <Grid size={{ xs: 12, sm: 4 }} key={i}>
              <Skeleton variant="rounded" height={100} />
            </Grid>
          ))}
        </Grid>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={120} sx={{ mb: 2 }} />
        ))}
      </Box>
    );
  }

  if (isError) {
    return (
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Alerts Dashboard
        </Typography>
        <Card>
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <Typography color="error">
              Failed to load alerts. Please try again later.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  const d = data || {
    generatedAt: '',
    summary: { total: 0, critical: 0, warning: 0, info: 0 },
    alerts: [],
  };

  const filteredAlerts = severityFilter === 'all'
    ? d.alerts
    : d.alerts.filter((a) => a.severity === severityFilter);

  const generatedTime = d.generatedAt
    ? new Date(d.generatedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <Box>
      <PageHeader
        title="Alerts Dashboard"
        subtitle={`Automated performance alerts comparing last 7 days vs previous 7 days${generatedTime ? ` -- Generated: ${generatedTime}` : ''}`}
      />

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <MetricCard
            title="Critical Alerts"
            value={d.summary.critical.toString()}
            icon={<ErrorOutlineIcon sx={{ fontSize: 40, color: severityConfig.critical.color }} />}
            accentColor={severityConfig.critical.color}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <MetricCard
            title="Warning Alerts"
            value={d.summary.warning.toString()}
            icon={<WarningAmberIcon sx={{ fontSize: 40, color: severityConfig.warning.color }} />}
            accentColor={severityConfig.warning.color}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <MetricCard
            title="Info Alerts"
            value={d.summary.info.toString()}
            icon={<InfoOutlinedIcon sx={{ fontSize: 40, color: severityConfig.info.color }} />}
            accentColor={severityConfig.info.color}
          />
        </Grid>
      </Grid>

      {/* Filter + Alert List */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">
          Alerts ({filteredAlerts.length})
        </Typography>
        <ToggleButtonGroup
          value={severityFilter}
          exclusive
          onChange={handleFilterChange}
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
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="critical">
            Critical ({d.summary.critical})
          </ToggleButton>
          <ToggleButton value="warning">
            Warning ({d.summary.warning})
          </ToggleButton>
          <ToggleButton value="info">
            Info ({d.summary.info})
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {filteredAlerts.length === 0 ? (
        <Card>
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              {d.alerts.length === 0
                ? 'No alerts detected. All metrics are within normal ranges.'
                : `No ${severityFilter} alerts found.`}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        filteredAlerts.map((alert, index) => (
          <AlertCard key={`${alert.partner}-${alert.metric}-${index}`} alert={alert} />
        ))
      )}
    </Box>
  );
}
