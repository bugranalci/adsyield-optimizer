'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Menu,
  MenuItem,
  Chip,
  Tooltip,
  Snackbar,
  Alert,
} from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import SyncIcon from '@mui/icons-material/Sync';
import LogoutIcon from '@mui/icons-material/Logout';
import HistoryIcon from '@mui/icons-material/History';
import { createClient } from '@/lib/supabase/client';

export default function TopBar() {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [syncing, setSyncing] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const handleSync = async (fullSync: boolean = false) => {
    setSyncing(true);
    setSnackbar({
      open: true,
      message: fullSync ? 'Syncing last 30 days from Limelight...' : "Syncing yesterday's data...",
      severity: 'info',
    });

    try {
      const res = await fetch('/api/limelight/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullSync ? { fullSync: true } : {}),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Sync failed');
      }

      setSnackbar({
        open: true,
        message: `Sync complete: ${data.rowsSynced} rows synced${data.errors ? ` (${data.errors} errors)` : ''}`,
        severity: data.errors ? 'error' : 'success',
      });

      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      setSnackbar({ open: true, message, severity: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ justifyContent: 'flex-end', gap: 1 }}>
          <Tooltip title="Sync yesterday's data from Limelight">
            <Chip
              icon={
                <SyncIcon
                  sx={{
                    animation: syncing ? 'spin 1s linear infinite' : 'none',
                    '@keyframes spin': {
                      '0%': { transform: 'rotate(0deg)' },
                      '100%': { transform: 'rotate(360deg)' },
                    },
                  }}
                />
              }
              label={syncing ? 'Syncing...' : 'Sync Now'}
              onClick={() => handleSync(false)}
              disabled={syncing}
              variant="outlined"
              size="small"
              sx={{ mr: 1 }}
            />
          </Tooltip>

          <Tooltip title="Sync last 30 days (initial data load)">
            <Chip
              icon={<HistoryIcon sx={{ fontSize: 16 }} />}
              label="Full Sync"
              onClick={() => handleSync(true)}
              disabled={syncing}
              variant="outlined"
              size="small"
              color="secondary"
              sx={{ mr: 1 }}
            />
          </Tooltip>

          <IconButton
            onClick={(e) => setAnchorEl(e.currentTarget)}
            size="small"
          >
            <AccountCircleIcon />
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem onClick={handleLogout}>
              <LogoutIcon sx={{ mr: 1, fontSize: 18 }} />
              <Typography variant="body2">Sign Out</Typography>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={8000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
