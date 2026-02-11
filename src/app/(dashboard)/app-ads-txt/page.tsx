'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  IconButton,
  LinearProgress,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import HistoryIcon from '@mui/icons-material/History';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ReplayIcon from '@mui/icons-material/Replay';
import DnsIcon from '@mui/icons-material/Dns';
import FindInPageIcon from '@mui/icons-material/FindInPage';
import { useQuery } from '@tanstack/react-query';
import type { PublisherDomain, AppAdsTxtSearchHistoryItem } from '@/types';
import PageHeader from '@/components/ui/PageHeader';
import MetricCard from '@/components/ui/MetricCard';

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AppAdsTxtPage() {
  // ---- State ----
  const [searchLine, setSearchLine] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<Array<{ url: string; domain: string; found: boolean }>>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [bulkText, setBulkText] = useState('');

  // Menu state
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  // ---- Data Fetching ----
  const { data: publishersData, refetch: refetchPublishers } = useQuery<{
    publishers: PublisherDomain[];
  }>({
    queryKey: ['app-ads-publishers'],
    queryFn: async () => {
      const res = await fetch('/api/app-ads-txt/publishers');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const { data: historyData, refetch: refetchHistory } = useQuery<{
    history: AppAdsTxtSearchHistoryItem[];
  }>({
    queryKey: ['app-ads-history'],
    queryFn: async () => {
      const res = await fetch('/api/app-ads-txt/history');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  // ---- Derived values ----
  const publishers = publishersData?.publishers ?? [];
  const history = historyData?.history ?? [];
  const foundResults = results.filter((r) => r.found);
  const progressPercent =
    searchProgress.total > 0 ? Math.round((searchProgress.current / searchProgress.total) * 100) : 0;

  // ---- Handlers ----

  const handleSearch = useCallback(async () => {
    if (!searchLine.trim() || isSearching) return;
    setIsSearching(true);
    setResults([]);
    setActiveTab(0);
    setSearchProgress({ current: 0, total: publishers.length });

    try {
      const res = await fetch('/api/app-ads-txt/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchLine: searchLine.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results || []);
        setSnackbar({
          open: true,
          message: `Found ${data.foundCount} matches in ${(data.durationMs / 1000).toFixed(1)}s`,
          severity: 'success',
        });
        refetchHistory();
      } else {
        setSnackbar({
          open: true,
          message: data.error || 'Search failed',
          severity: 'error',
        });
      }
    } catch {
      setSnackbar({ open: true, message: 'Search failed', severity: 'error' });
    } finally {
      setIsSearching(false);
      setSearchProgress({ current: 0, total: 0 });
    }
  }, [searchLine, isSearching, publishers.length, refetchHistory]);

  const handleAddPublisher = async () => {
    if (!addUrl.trim()) return;
    try {
      const res = await fetch('/api/app-ads-txt/publishers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: addUrl.trim() }),
      });
      if (res.ok) {
        setSnackbar({ open: true, message: 'Publisher added', severity: 'success' });
        refetchPublishers();
      } else {
        const data = await res.json();
        setSnackbar({ open: true, message: data.error || 'Failed to add publisher', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to add publisher', severity: 'error' });
    }
    setAddUrl('');
    setAddDialogOpen(false);
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    const urls = bulkText
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) return;

    try {
      const res = await fetch('/api/app-ads-txt/publishers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      if (res.ok) {
        setSnackbar({ open: true, message: `Imported ${urls.length} publishers`, severity: 'success' });
        refetchPublishers();
      } else {
        const data = await res.json();
        setSnackbar({ open: true, message: data.error || 'Bulk import failed', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Bulk import failed', severity: 'error' });
    }
    setBulkText('');
    setBulkDialogOpen(false);
  };

  const handleDeletePublisher = async (id: number) => {
    try {
      const res = await fetch(`/api/app-ads-txt/publishers?id=${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSnackbar({ open: true, message: 'Publisher removed', severity: 'success' });
        refetchPublishers();
      } else {
        setSnackbar({ open: true, message: 'Failed to remove publisher', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to remove publisher', severity: 'error' });
    }
  };

  const handleExportAll = () => {
    if (publishers.length === 0) {
      setSnackbar({ open: true, message: 'No publishers to export', severity: 'error' });
      return;
    }
    const text = publishers.map((p) => p.url).join('\n');
    navigator.clipboard.writeText(text);
    setSnackbar({ open: true, message: `Copied ${publishers.length} publisher URLs to clipboard`, severity: 'success' });
  };

  const handleResetDefaults = async () => {
    setMenuAnchor(null);
    try {
      const res = await fetch('/api/app-ads-txt/publishers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_defaults' }),
      });
      if (res.ok) {
        setSnackbar({ open: true, message: 'Publishers reset to defaults', severity: 'success' });
        refetchPublishers();
      } else {
        setSnackbar({ open: true, message: 'Failed to reset', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to reset', severity: 'error' });
    }
  };

  const handleClearAll = async () => {
    setMenuAnchor(null);
    try {
      const res = await fetch('/api/app-ads-txt/publishers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_all' }),
      });
      if (res.ok) {
        setSnackbar({ open: true, message: 'All publishers cleared', severity: 'success' });
        refetchPublishers();
      } else {
        setSnackbar({ open: true, message: 'Failed to clear', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to clear', severity: 'error' });
    }
  };

  const handleClearHistory = async () => {
    try {
      const res = await fetch('/api/app-ads-txt/history', { method: 'DELETE' });
      if (res.ok) {
        setSnackbar({ open: true, message: 'History cleared', severity: 'success' });
        refetchHistory();
      } else {
        setSnackbar({ open: true, message: 'Failed to clear history', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to clear history', severity: 'error' });
    }
  };

  const handleCopyAllUrls = () => {
    const urls = foundResults.map((r) => r.url);
    if (urls.length === 0) {
      setSnackbar({ open: true, message: 'No matching URLs to copy', severity: 'error' });
      return;
    }
    navigator.clipboard.writeText(urls.join('\n'));
    setSnackbar({ open: true, message: `Copied ${urls.length} URLs to clipboard`, severity: 'success' });
  };

  const handleExportJson = () => {
    if (results.length === 0) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `app-ads-txt-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSearchAgain = (term: string) => {
    setSearchLine(term);
    // Defer handleSearch to next tick so state is updated
    setTimeout(() => {
      setIsSearching(true);
      setResults([]);
      setActiveTab(0);
      setSearchProgress({ current: 0, total: publishers.length });

      fetch('/api/app-ads-txt/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchLine: term }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (res.ok) {
            setResults(data.results || []);
            setSnackbar({
              open: true,
              message: `Found ${data.foundCount} matches in ${(data.durationMs / 1000).toFixed(1)}s`,
              severity: 'success',
            });
            refetchHistory();
          } else {
            setSnackbar({ open: true, message: data.error || 'Search failed', severity: 'error' });
          }
        })
        .catch(() => {
          setSnackbar({ open: true, message: 'Search failed', severity: 'error' });
        })
        .finally(() => {
          setIsSearching(false);
          setSearchProgress({ current: 0, total: 0 });
        });
    }, 0);
  };

  // ---- Render ----
  return (
    <Box>
      {/* Header */}
      <PageHeader title="App-Ads.txt Tracker" />

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <MetricCard
            title="Publisher Network"
            value={publishers.length}
            format="number"
            icon={<DnsIcon />}
            accentColor="#6366F1"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <MetricCard
            title="Search Results"
            value={results.length}
            format="number"
            icon={<FindInPageIcon />}
            accentColor="#00D9A6"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <MetricCard
            title="Search History"
            value={history.length}
            format="number"
            icon={<HistoryIcon />}
            accentColor="#ff9800"
          />
        </Grid>
      </Grid>

      {/* Search Section */}
      <Paper
        sx={{
          p: 2.5,
          mb: 3,
          bgcolor: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 2,
        }}
      >
        <Box sx={{ display: 'flex', gap: 1.5, mb: isSearching ? 2 : 0 }}>
          <TextField
            fullWidth
            size="small"
            placeholder='e.g. "pubmatic.com", "162239", "RESELLER"'
            value={searchLine}
            onChange={(e) => setSearchLine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            disabled={isSearching}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'rgba(255,255,255,0.03)',
              },
            }}
          />
          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            onClick={handleSearch}
            disabled={isSearching || !searchLine.trim()}
            sx={{ textTransform: 'none', minWidth: 120, bgcolor: '#6366F1', '&:hover': { bgcolor: '#4B44B2' } }}
          >
            Search
          </Button>
        </Box>

        {isSearching && (
          <Box>
            <LinearProgress
              variant="determinate"
              value={progressPercent}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: 'rgba(255,255,255,0.08)',
                '& .MuiLinearProgress-bar': { bgcolor: '#6366F1', borderRadius: 4 },
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Searching {searchProgress.current} of {searchProgress.total} publishers... {progressPercent}%
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
            '& .Mui-selected': { color: '#6366F1' },
            '& .MuiTabs-indicator': { bgcolor: '#6366F1' },
          }}
        >
          <Tab label={`Results (${foundResults.length})`} />
          <Tab label={`Publishers (${publishers.length})`} />
          <Tab label={`History (${history.length})`} />
        </Tabs>
      </Box>

      {/* Tab Content */}
      <Box sx={{ minHeight: 400 }}>
        {/* ---- Tab 0: Results ---- */}
        {activeTab === 0 && (
          <Box>
            {results.length === 0 ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  py: 10,
                }}
              >
                <FindInPageIcon sx={{ fontSize: 56, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
                <Typography variant="body1" color="text.secondary">
                  No results yet. Enter a search line and click Search.
                </Typography>
              </Box>
            ) : (
              <>
                <TableContainer
                  component={Paper}
                  sx={{
                    bgcolor: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 2,
                  }}
                >
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Domain</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>URL</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">
                          Actions
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {results.map((row, idx) => (
                        <TableRow key={idx} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                          <TableCell>
                            <Chip
                              icon={row.found ? <CheckCircleIcon /> : undefined}
                              label={row.domain}
                              size="small"
                              sx={{
                                bgcolor: row.found ? 'rgba(0,217,166,0.15)' : 'rgba(255,82,82,0.15)',
                                color: row.found ? '#00D9A6' : '#FF5252',
                                fontWeight: 600,
                                '& .MuiChip-icon': { color: row.found ? '#00D9A6' : '#FF5252' },
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="caption"
                              sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                            >
                              {row.url}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Open in new tab">
                              <IconButton
                                size="small"
                                onClick={() => window.open(row.url, '_blank', 'noopener')}
                              >
                                <OpenInNewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Copy URL">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  navigator.clipboard.writeText(row.url);
                                  setSnackbar({ open: true, message: 'URL copied', severity: 'success' });
                                }}
                              >
                                <ContentCopyIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Box sx={{ display: 'flex', gap: 1.5, mt: 2 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ContentCopyIcon />}
                    onClick={handleCopyAllUrls}
                    sx={{ textTransform: 'none', borderColor: '#6366F1', color: '#6366F1' }}
                  >
                    Copy All URLs ({foundResults.length})
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<DownloadIcon />}
                    onClick={handleExportJson}
                    sx={{ textTransform: 'none', borderColor: '#6366F1', color: '#6366F1' }}
                  >
                    Export JSON
                  </Button>
                </Box>
              </>
            )}
          </Box>
        )}

        {/* ---- Tab 1: Publishers ---- */}
        {activeTab === 1 && (
          <Box>
            {/* Actions row */}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setAddDialogOpen(true)}
                sx={{ textTransform: 'none', bgcolor: '#6366F1', '&:hover': { bgcolor: '#4B44B2' } }}
              >
                Add Publisher
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<UploadFileIcon />}
                onClick={() => setBulkDialogOpen(true)}
                sx={{ textTransform: 'none', borderColor: '#6366F1', color: '#6366F1' }}
              >
                Bulk Import
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={handleExportAll}
                sx={{ textTransform: 'none', borderColor: '#6366F1', color: '#6366F1' }}
              >
                Export All
              </Button>
              <IconButton
                size="small"
                onClick={(e) => setMenuAnchor(e.currentTarget)}
                sx={{ ml: 'auto' }}
              >
                <MoreVertIcon />
              </IconButton>
              <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
              >
                <MenuItem onClick={handleResetDefaults}>Reset to Defaults</MenuItem>
                <MenuItem onClick={handleClearAll} sx={{ color: '#FF5252' }}>
                  Clear All
                </MenuItem>
              </Menu>
            </Box>

            {/* Publisher grid */}
            {publishers.length === 0 ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  py: 10,
                }}
              >
                <DnsIcon sx={{ fontSize: 56, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
                <Typography variant="body1" color="text.secondary">
                  No publishers yet. Add one or import a list.
                </Typography>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {publishers.map((pub) => (
                  <Grid key={pub.id} size={{ xs: 12, sm: 6, md: 4 }}>
                    <Paper
                      sx={{
                        p: 2,
                        bgcolor: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                      }}
                    >
                      <Box sx={{ overflow: 'hidden', minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={700} noWrap>
                          {pub.domain}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontFamily: 'monospace', display: 'block' }}
                          noWrap
                        >
                          {pub.url}
                        </Typography>
                      </Box>
                      <Tooltip title="Delete publisher">
                        <IconButton
                          size="small"
                          onClick={() => handleDeletePublisher(pub.id)}
                          sx={{ color: 'text.secondary', '&:hover': { color: '#FF5252' } }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        )}

        {/* ---- Tab 2: History ---- */}
        {activeTab === 2 && (
          <Box>
            {/* Clear history button */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DeleteSweepIcon />}
                onClick={handleClearHistory}
                disabled={history.length === 0}
                sx={{ textTransform: 'none', borderColor: '#FF5252', color: '#FF5252' }}
              >
                Clear History
              </Button>
            </Box>

            {history.length === 0 ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  py: 10,
                }}
              >
                <HistoryIcon sx={{ fontSize: 56, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
                <Typography variant="body1" color="text.secondary">
                  No search history yet.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {history.map((item) => (
                  <Paper
                    key={item.id}
                    sx={{
                      p: 2,
                      bgcolor: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 2,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body1" fontWeight={600} noWrap>
                        {item.search_line}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(item.searched_at).toLocaleString()} &middot; {item.found_count} found of{' '}
                        {item.total_publishers} &middot; {(item.duration_ms / 1000).toFixed(1)}s
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<ReplayIcon />}
                      onClick={() => handleSearchAgain(item.search_line)}
                      disabled={isSearching}
                      sx={{ textTransform: 'none', borderColor: '#6366F1', color: '#6366F1', flexShrink: 0 }}
                    >
                      Search Again
                    </Button>
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* ---- Add Publisher Dialog ---- */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.1)' },
        }}
      >
        <DialogTitle>Add Publisher</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Publisher URL"
            placeholder="https://example.com/app-ads.txt"
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddPublisher();
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddPublisher}
            disabled={!addUrl.trim()}
            sx={{ textTransform: 'none', bgcolor: '#6366F1', '&:hover': { bgcolor: '#4B44B2' } }}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---- Bulk Import Dialog ---- */}
      <Dialog
        open={bulkDialogOpen}
        onClose={() => setBulkDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.1)' },
        }}
      >
        <DialogTitle>Bulk Import Publishers</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={10}
            label="Publisher URLs (one per line)"
            placeholder={
              'https://example.com/app-ads.txt\nhttps://another.com/app-ads.txt\nhttps://third.com/app-ads.txt'
            }
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDialogOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleBulkImport}
            disabled={!bulkText.trim()}
            sx={{ textTransform: 'none', bgcolor: '#6366F1', '&:hover': { bgcolor: '#4B44B2' } }}
          >
            Import
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---- Snackbar ---- */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
