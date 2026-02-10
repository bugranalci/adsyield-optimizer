'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DemandPartner {
  name: string;
  revenue: number;
  impressions: number;
  bidRequests: number;
  bids: number;
  wins: number;
  timeouts: number;
  errors: number;
  ecpm: number;
  fillRate: number;
  timeoutRate: number;
}

interface Publisher {
  name: string;
  revenue: number;
  impressions: number;
  bidRequests: number;
  bids: number;
  wins: number;
  timeouts: number;
  errors: number;
  pubPayout: number;
  ecpm: number;
  fillRate: number;
  timeoutRate: number;
}

interface CrossRef {
  demandPartner: string;
  publisher: string;
  revenue: number;
  impressions: number;
  bidRequests: number;
  ecpm: number;
  fillRate: number;
  timeoutRate: number;
}

interface PartnersData {
  period: number;
  demandPartners: DemandPartner[];
  publishers: Publisher[];
  crossReference: CrossRef[];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtNumber(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

function fmtPercent(v: number): string {
  return `${v.toFixed(2)}%`;
}

function fmtEcpm(v: number): string {
  return `$${v.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

type SortDir = 'asc' | 'desc';

interface Column<T> {
  id: keyof T;
  label: string;
  align: 'left' | 'right';
  format: (v: number) => string;
  minWidth?: number;
}

const demandColumns: Column<DemandPartner>[] = [
  { id: 'name', label: 'Demand Partner', align: 'left', format: (v) => String(v), minWidth: 200 },
  { id: 'revenue', label: 'Revenue', align: 'right', format: fmtCurrency },
  { id: 'impressions', label: 'Impressions', align: 'right', format: fmtNumber },
  { id: 'ecpm', label: 'eCPM', align: 'right', format: fmtEcpm },
  { id: 'fillRate', label: 'Fill Rate', align: 'right', format: fmtPercent },
  { id: 'timeoutRate', label: 'Timeout Rate', align: 'right', format: fmtPercent },
  { id: 'bidRequests', label: 'Bid Requests', align: 'right', format: fmtNumber },
];

const publisherColumns: Column<Publisher>[] = [
  { id: 'name', label: 'Publisher', align: 'left', format: (v) => String(v), minWidth: 200 },
  { id: 'revenue', label: 'Revenue', align: 'right', format: fmtCurrency },
  { id: 'impressions', label: 'Impressions', align: 'right', format: fmtNumber },
  { id: 'ecpm', label: 'eCPM', align: 'right', format: fmtEcpm },
  { id: 'fillRate', label: 'Fill Rate', align: 'right', format: fmtPercent },
  { id: 'timeoutRate', label: 'Timeout Rate', align: 'right', format: fmtPercent },
  { id: 'bidRequests', label: 'Bid Requests', align: 'right', format: fmtNumber },
];

// ---------------------------------------------------------------------------
// Sortable table component
// ---------------------------------------------------------------------------

function SortableTable<T extends object>({
  rows,
  columns,
  defaultSort,
}: {
  rows: T[];
  columns: Column<T>[];
  defaultSort: keyof T;
}) {
  const [orderBy, setOrderBy] = useState<keyof T>(defaultSort);
  const [order, setOrder] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const comparator = (a: T, b: T) => {
      const av = a[orderBy];
      const bv = b[orderBy];
      if (typeof av === 'string' && typeof bv === 'string') {
        return order === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return order === 'asc' ? an - bn : bn - an;
    };
    return [...rows].sort(comparator);
  }, [rows, orderBy, order]);

  const handleSort = (col: keyof T) => {
    if (orderBy === col) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setOrderBy(col);
      setOrder('desc');
    }
  };

  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
        No data available. Sync your Limelight account to populate this view.
      </Typography>
    );
  }

  return (
    <TableContainer sx={{ maxHeight: 600 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell
                key={String(col.id)}
                align={col.align}
                sx={{
                  fontWeight: 700,
                  bgcolor: 'background.paper',
                  minWidth: col.minWidth,
                  whiteSpace: 'nowrap',
                }}
              >
                <TableSortLabel
                  active={orderBy === col.id}
                  direction={orderBy === col.id ? order : 'desc'}
                  onClick={() => handleSort(col.id)}
                  sx={{
                    '&.MuiTableSortLabel-root': { color: 'text.secondary' },
                    '&.MuiTableSortLabel-root:hover': { color: 'text.primary' },
                    '&.Mui-active': { color: 'primary.main' },
                    '& .MuiTableSortLabel-icon': { color: 'primary.main !important' },
                  }}
                >
                  {col.label}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((row, idx) => (
            <TableRow
              key={idx}
              sx={{
                '&:last-child td': { borderBottom: 0 },
                '&:hover': { bgcolor: 'rgba(99, 102, 241, 0.04)' },
              }}
            >
              {columns.map((col) => {
                const val = row[col.id];
                const isName = col.id === 'name';
                return (
                  <TableCell
                    key={String(col.id)}
                    align={col.align}
                    sx={{
                      ...(isName && {
                        maxWidth: 280,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: 500,
                      }),
                    }}
                  >
                    {isName ? String(val) : col.format(Number(val))}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ---------------------------------------------------------------------------
// Cross-reference matrix section
// ---------------------------------------------------------------------------

function CrossReferenceTable({ data }: { data: CrossRef[] }) {
  const [orderBy, setOrderBy] = useState<'revenue' | 'impressions' | 'ecpm' | 'fillRate' | 'timeoutRate'>('revenue');
  const [order, setOrder] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[orderBy];
      const bv = b[orderBy];
      return order === 'asc' ? av - bv : bv - av;
    });
  }, [data, orderBy, order]);

  const handleSort = (col: typeof orderBy) => {
    if (orderBy === col) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setOrderBy(col);
      setOrder('desc');
    }
  };

  if (data.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
        No cross-reference data available.
      </Typography>
    );
  }

  const crossColumns: { id: 'revenue' | 'impressions' | 'ecpm' | 'fillRate' | 'timeoutRate'; label: string; format: (v: number) => string }[] = [
    { id: 'revenue', label: 'Revenue', format: fmtCurrency },
    { id: 'impressions', label: 'Impressions', format: fmtNumber },
    { id: 'ecpm', label: 'eCPM', format: fmtEcpm },
    { id: 'fillRate', label: 'Fill Rate', format: fmtPercent },
    { id: 'timeoutRate', label: 'Timeout Rate', format: fmtPercent },
  ];

  return (
    <TableContainer sx={{ maxHeight: 500 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', minWidth: 180, whiteSpace: 'nowrap' }}>
              Demand Partner
            </TableCell>
            <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', minWidth: 180, whiteSpace: 'nowrap' }}>
              Publisher
            </TableCell>
            {crossColumns.map((col) => (
              <TableCell
                key={col.id}
                align="right"
                sx={{ fontWeight: 700, bgcolor: 'background.paper', whiteSpace: 'nowrap' }}
              >
                <TableSortLabel
                  active={orderBy === col.id}
                  direction={orderBy === col.id ? order : 'desc'}
                  onClick={() => handleSort(col.id)}
                  sx={{
                    '&.MuiTableSortLabel-root': { color: 'text.secondary' },
                    '&.MuiTableSortLabel-root:hover': { color: 'text.primary' },
                    '&.Mui-active': { color: 'primary.main' },
                    '& .MuiTableSortLabel-icon': { color: 'primary.main !important' },
                  }}
                >
                  {col.label}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.slice(0, 100).map((row, idx) => (
            <TableRow
              key={idx}
              sx={{
                '&:last-child td': { borderBottom: 0 },
                '&:hover': { bgcolor: 'rgba(99, 102, 241, 0.04)' },
              }}
            >
              <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                {row.demandPartner}
              </TableCell>
              <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                {row.publisher}
              </TableCell>
              {crossColumns.map((col) => (
                <TableCell key={col.id} align="right">
                  {col.format(row[col.id])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Supply &amp; Demand Analysis
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Skeleton variant="rounded" width={200} height={40} />
        <Skeleton variant="rounded" width={300} height={40} />
      </Box>
      <Card>
        <CardContent>
          <Skeleton variant="text" width={200} height={32} sx={{ mb: 2 }} />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="text" height={44} sx={{ mb: 0.5 }} />
          ))}
        </CardContent>
      </Card>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SupplyDemandPage() {
  const [period, setPeriod] = useState<number>(7);
  const [activeTab, setActiveTab] = useState<number>(0);

  const { data, isLoading } = useQuery<PartnersData>({
    queryKey: ['partners', period],
    queryFn: async () => {
      const res = await fetch(`/api/stats/partners?period=${period}`);
      if (!res.ok) throw new Error('Failed to fetch supply-demand data');
      return res.json();
    },
  });

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  const d = data || { period: 7, demandPartners: [], publishers: [], crossReference: [] };

  const totalRevenue = d.demandPartners.reduce((s, p) => s + p.revenue, 0);
  const totalImpressions = d.demandPartners.reduce((s, p) => s + p.impressions, 0);
  const totalBidRequests = d.demandPartners.reduce((s, p) => s + p.bidRequests, 0);

  return (
    <Box>
      <PageHeader
        title="Supply & Demand Analysis"
        subtitle="Performance matrix across demand partners and publishers"
      >
        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={(_, val) => { if (val !== null) setPeriod(val); }}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              fontWeight: 600,
              px: 2,
              borderColor: 'divider',
              '&.Mui-selected': {
                bgcolor: 'primary.main',
                color: '#fff',
                '&:hover': { bgcolor: 'primary.dark' },
              },
            },
          }}
        >
          <ToggleButton value={7}>7 Days</ToggleButton>
          <ToggleButton value={14}>14 Days</ToggleButton>
          <ToggleButton value={30}>30 Days</ToggleButton>
        </ToggleButtonGroup>

        {/* Summary chips */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label={`Revenue: ${fmtCurrency(totalRevenue)}`}
            size="small"
            sx={{ bgcolor: 'rgba(99, 102, 241, 0.12)', color: 'primary.light', fontWeight: 600 }}
          />
          <Chip
            label={`Impressions: ${fmtNumber(totalImpressions)}`}
            size="small"
            sx={{ bgcolor: 'rgba(0, 217, 166, 0.12)', color: 'secondary.light', fontWeight: 600 }}
          />
          <Chip
            label={`Bid Requests: ${fmtNumber(totalBidRequests)}`}
            size="small"
            sx={{ bgcolor: 'rgba(41, 182, 246, 0.12)', color: 'info.main', fontWeight: 600 }}
          />
        </Box>
      </PageHeader>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 0 }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              minWidth: 140,
            },
          }}
        >
          <Tab label={`Demand Partners (${d.demandPartners.length})`} />
          <Tab label={`Publishers (${d.publishers.length})`} />
          <Tab label={`Cross Reference (${d.crossReference.length})`} />
        </Tabs>
      </Box>

      {/* Tab panels */}
      <Card sx={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          {activeTab === 0 && (
            <SortableTable<DemandPartner>
              rows={d.demandPartners}
              columns={demandColumns}
              defaultSort="revenue"
            />
          )}
          {activeTab === 1 && (
            <SortableTable<Publisher>
              rows={d.publishers}
              columns={publisherColumns}
              defaultSort="revenue"
            />
          )}
          {activeTab === 2 && (
            <CrossReferenceTable data={d.crossReference} />
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
