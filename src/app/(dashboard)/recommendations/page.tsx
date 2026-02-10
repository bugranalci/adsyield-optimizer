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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  LinearProgress,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useQuery } from '@tanstack/react-query';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';

type RecommendationType = 'partner-bid-floor' | 'timeout-fix' | 'fill-rate' | 'revenue-leakage' | 'publisher-quality';
type Priority = 'critical' | 'high' | 'medium' | 'low';

interface Recommendation {
  id: string;
  type: RecommendationType;
  priority: Priority;
  title: string;
  description: string;
  estimatedRevenueLift: number;
  difficulty: 'easy' | 'medium' | 'hard';
  actionSteps: string[];
  partner?: string;
  publisher?: string;
  currentValue?: number;
  targetValue?: number;
}

interface RecommendationsData {
  summary: {
    totalRecommendations: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    estimatedTotalRevenueLift: number;
  };
  recommendations: Recommendation[];
}

const TYPE_LABELS: Record<RecommendationType, string> = {
  'partner-bid-floor': 'Bid Floor',
  'timeout-fix': 'Timeout Fix',
  'fill-rate': 'Fill Rate',
  'revenue-leakage': 'Revenue Leakage',
  'publisher-quality': 'Publisher Quality',
};

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: '#FF5252',
  high: '#FFB74D',
  medium: '#29B6F6',
  low: '#9AA0A6',
};

const PRIORITY_BG: Record<Priority, string> = {
  critical: 'rgba(255, 82, 82, 0.12)',
  high: 'rgba(255, 183, 77, 0.12)',
  medium: 'rgba(41, 182, 246, 0.12)',
  low: 'rgba(154, 160, 166, 0.12)',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#4CAF50',
  medium: '#FFB74D',
  hard: '#FF5252',
};

const ALL_TYPES: RecommendationType[] = ['partner-bid-floor', 'timeout-fix', 'fill-rate', 'revenue-leakage', 'publisher-quality'];
const ALL_PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (idx: number) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const completedPct = rec.actionSteps.length > 0
    ? (checkedSteps.size / rec.actionSteps.length) * 100
    : 0;

  return (
    <Card
      sx={{
        borderLeft: '4px solid',
        borderLeftColor: PRIORITY_COLORS[rec.priority],
        transition: 'transform 0.15s, box-shadow 0.15s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 4px 20px rgba(0,0,0,0.3)`,
        },
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        {/* Header: Priority + Type badges */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <Chip
            label={rec.priority.toUpperCase()}
            size="small"
            sx={{
              fontWeight: 700,
              fontSize: '0.65rem',
              letterSpacing: 0.5,
              bgcolor: PRIORITY_BG[rec.priority],
              color: PRIORITY_COLORS[rec.priority],
              height: 22,
            }}
          />
          <Chip
            label={TYPE_LABELS[rec.type]}
            size="small"
            variant="outlined"
            sx={{
              fontSize: '0.7rem',
              height: 22,
              borderColor: 'rgba(255,255,255,0.15)',
              color: 'text.secondary',
            }}
          />
          <Chip
            label={rec.difficulty}
            size="small"
            sx={{
              fontSize: '0.65rem',
              fontWeight: 600,
              height: 22,
              bgcolor: `${DIFFICULTY_COLORS[rec.difficulty]}20`,
              color: DIFFICULTY_COLORS[rec.difficulty],
            }}
          />
        </Box>

        {/* Title */}
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          {rec.title}
        </Typography>

        {/* Description */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
          {rec.description}
        </Typography>

        {/* Estimated Revenue Lift */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 2,
            p: 1.5,
            borderRadius: 1.5,
            bgcolor: 'rgba(76, 175, 80, 0.08)',
            border: '1px solid rgba(76, 175, 80, 0.15)',
          }}
        >
          <TrendingUpIcon sx={{ color: 'success.main', fontSize: 20 }} />
          <Box>
            <Typography variant="caption" color="text.secondary">
              Estimated Revenue Lift
            </Typography>
            <Typography variant="body1" fontWeight={700} color="success.main">
              +${rec.estimatedRevenueLift.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Typography>
          </Box>
        </Box>

        {/* Current vs Target */}
        {rec.currentValue !== undefined && rec.targetValue !== undefined && (
          <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Current
              </Typography>
              <Typography variant="body2" fontWeight={600} color="error.main">
                {rec.currentValue.toFixed(2)}{rec.type === 'partner-bid-floor' ? ' eCPM' : '%'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Target
              </Typography>
              <Typography variant="body2" fontWeight={600} color="success.main">
                {rec.targetValue.toFixed(2)}{rec.type === 'partner-bid-floor' ? ' eCPM' : '%'}
              </Typography>
            </Box>
          </Box>
        )}

        {/* Action Steps */}
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Action Steps
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {checkedSteps.size}/{rec.actionSteps.length}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={completedPct}
            sx={{
              height: 3,
              borderRadius: 2,
              mb: 1.5,
              bgcolor: 'rgba(255,255,255,0.05)',
              '& .MuiLinearProgress-bar': {
                borderRadius: 2,
                bgcolor: completedPct === 100 ? 'success.main' : 'primary.main',
              },
            }}
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {rec.actionSteps.map((step, idx) => (
              <Box
                key={idx}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 0.5,
                  cursor: 'pointer',
                  py: 0.25,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
                  borderRadius: 0.5,
                }}
                onClick={() => toggleStep(idx)}
              >
                <Checkbox
                  checked={checkedSteps.has(idx)}
                  size="small"
                  sx={{
                    p: 0.25,
                    mt: 0.1,
                    color: 'text.secondary',
                    '&.Mui-checked': { color: 'success.main' },
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    textDecoration: checkedSteps.has(idx) ? 'line-through' : 'none',
                    color: checkedSteps.has(idx) ? 'text.secondary' : 'text.primary',
                    lineHeight: 1.5,
                  }}
                >
                  {step}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function RecommendationsPage() {
  const [typeFilters, setTypeFilters] = useState<RecommendationType[]>([]);
  const [priorityFilters, setPriorityFilters] = useState<Priority[]>([]);

  const { data, isLoading } = useQuery<RecommendationsData>({
    queryKey: ['recommendations'],
    queryFn: async () => {
      const res = await fetch('/api/analysis/recommendations');
      if (!res.ok) throw new Error('Failed to fetch recommendations');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Optimization Recommendations
        </Typography>
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {[1, 2, 3].map((i) => (
            <Grid size={{ xs: 12, sm: 4 }} key={i}>
              <Skeleton variant="rounded" height={110} />
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map((i) => (
            <Grid size={{ xs: 12, md: 6 }} key={i}>
              <Skeleton variant="rounded" height={300} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  const d = data || {
    summary: {
      totalRecommendations: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      estimatedTotalRevenueLift: 0,
    },
    recommendations: [],
  };

  // Apply filters
  const filteredRecs = d.recommendations.filter((rec) => {
    const typeMatch = typeFilters.length === 0 || typeFilters.includes(rec.type);
    const priorityMatch = priorityFilters.length === 0 || priorityFilters.includes(rec.priority);
    return typeMatch && priorityMatch;
  });

  return (
    <Box>
      <PageHeader
        title="Optimization Recommendations"
        subtitle="AI-powered analysis of the last 7 days to identify revenue opportunities"
      />

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <MetricCard
            title="Total Recommendations"
            value={d.summary.totalRecommendations.toString()}
            icon={<LightbulbIcon />}
            badge={
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', ml: 1 }}>
                {d.summary.criticalCount > 0 && (
                  <Chip
                    label={`${d.summary.criticalCount} Critical`}
                    size="small"
                    sx={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      height: 20,
                      bgcolor: PRIORITY_BG.critical,
                      color: PRIORITY_COLORS.critical,
                    }}
                  />
                )}
                {d.summary.highCount > 0 && (
                  <Chip
                    label={`${d.summary.highCount} High`}
                    size="small"
                    sx={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      height: 20,
                      bgcolor: PRIORITY_BG.high,
                      color: PRIORITY_COLORS.high,
                    }}
                  />
                )}
              </Box>
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <MetricCard
            title="Critical Issues"
            value={d.summary.criticalCount.toString()}
            icon={<ErrorOutlineIcon />}
            subtitle={d.summary.criticalCount > 0 ? 'Requires immediate attention' : 'No critical issues found'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <MetricCard
            title="Est. Total Revenue Lift"
            value={`+$${d.summary.estimatedTotalRevenueLift.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            icon={<WarningAmberIcon />}
            subtitle="If all recommendations are implemented"
          />
        </Grid>
      </Grid>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Filter by Type</InputLabel>
          <Select
            multiple
            value={typeFilters}
            onChange={(e) => setTypeFilters(e.target.value as RecommendationType[])}
            label="Filter by Type"
            renderValue={(selected) =>
              selected.length === 0
                ? 'All Types'
                : selected.map((t) => TYPE_LABELS[t]).join(', ')
            }
          >
            {ALL_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                <Checkbox checked={typeFilters.includes(type)} size="small" />
                <ListItemText primary={TYPE_LABELS[type]} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Filter by Priority</InputLabel>
          <Select
            multiple
            value={priorityFilters}
            onChange={(e) => setPriorityFilters(e.target.value as Priority[])}
            label="Filter by Priority"
            renderValue={(selected) =>
              selected.length === 0
                ? 'All Priorities'
                : selected.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')
            }
          >
            {ALL_PRIORITIES.map((priority) => (
              <MenuItem key={priority} value={priority}>
                <Checkbox checked={priorityFilters.includes(priority)} size="small" />
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          bgcolor: PRIORITY_COLORS[priority],
                        }}
                      />
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </Box>
                  }
                />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {(typeFilters.length > 0 || priorityFilters.length > 0) && (
          <Typography
            variant="body2"
            color="primary"
            sx={{
              cursor: 'pointer',
              alignSelf: 'center',
              '&:hover': { textDecoration: 'underline' },
            }}
            onClick={() => {
              setTypeFilters([]);
              setPriorityFilters([]);
            }}
          >
            Clear filters
          </Typography>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center', ml: 'auto' }}>
          Showing {filteredRecs.length} of {d.recommendations.length} recommendations
        </Typography>
      </Box>

      {/* Recommendation Cards */}
      {filteredRecs.length === 0 ? (
        <Card>
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <LightbulbIcon sx={{ fontSize: 48, color: 'text.secondary', opacity: 0.3, mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {d.recommendations.length === 0
                ? 'No Recommendations Yet'
                : 'No Matching Recommendations'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {d.recommendations.length === 0
                ? 'Sync Limelight data to generate optimization recommendations.'
                : 'Try adjusting your filters to see more recommendations.'}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {filteredRecs.map((rec) => (
            <Grid size={{ xs: 12, md: 6 }} key={rec.id}>
              <RecommendationCard rec={rec} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
