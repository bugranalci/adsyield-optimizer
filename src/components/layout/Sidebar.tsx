'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import TimerOffIcon from '@mui/icons-material/TimerOff';
import AppsIcon from '@mui/icons-material/Apps';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import VerifiedIcon from '@mui/icons-material/Verified';
import BrushIcon from '@mui/icons-material/Brush';
import FilterListIcon from '@mui/icons-material/FilterList';
import NotificationsIcon from '@mui/icons-material/Notifications';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PieChartIcon from '@mui/icons-material/PieChart';
import DescriptionIcon from '@mui/icons-material/Description';
import ShieldIcon from '@mui/icons-material/Shield';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

const DRAWER_WIDTH = 260;

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  section?: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: <DashboardIcon />, section: 'Overview' },
  { label: 'Supply & Demand', path: '/supply-demand', icon: <CompareArrowsIcon />, section: 'Analysis' },
  { label: 'Ad Size Analysis', path: '/ad-size', icon: <AspectRatioIcon /> },
  { label: 'Timeout Analysis', path: '/timeout', icon: <TimerOffIcon /> },
  { label: 'Bundle Analytics', path: '/bundles', icon: <AppsIcon /> },
  { label: 'Demand Appetite', path: '/demand-appetite', icon: <TrendingUpIcon /> },
  { label: 'Revenue Concentration', path: '/revenue-concentration', icon: <PieChartIcon /> },
  { label: 'Recommendations', path: '/recommendations', icon: <LightbulbIcon />, section: 'Optimization' },
  { label: 'Task Manager', path: '/tasks', icon: <TaskAltIcon /> },
  { label: 'Supply Quality', path: '/supply-quality', icon: <VerifiedIcon /> },
  { label: 'Creative Performance', path: '/creative-performance', icon: <BrushIcon /> },
  { label: 'Filter Analysis', path: '/filter-analysis', icon: <FilterListIcon /> },
  { label: 'Alerts', path: '/alerts', icon: <NotificationsIcon /> },
  { label: 'IVT Monitoring', path: '/ivt', icon: <ShieldIcon />, section: 'Tools' },
  { label: 'App-Ads.txt', path: '/app-ads-txt', icon: <DescriptionIcon /> },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        setIsAdmin(profile?.role === 'admin');
      }
    };
    checkAdmin();
  }, []);

  let lastSection = '';

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          bgcolor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 800,
            background: 'linear-gradient(135deg, #6366F1, #818CF8)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Adsyield
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
          Optimizer
        </Typography>
      </Box>

      <Divider />

      <List sx={{ px: 1, py: 0.5, flex: 1, overflow: 'auto' }}>
        {navItems.map((item) => {
          const showSection = item.section && item.section !== lastSection;
          if (item.section) lastSection = item.section;
          const isActive = pathname === item.path;

          return (
            <Box key={item.path}>
              {showSection && (
                <Typography
                  variant="overline"
                  sx={{
                    px: 2,
                    pt: 2,
                    pb: 0.5,
                    display: 'block',
                    color: 'text.secondary',
                    fontSize: '0.65rem',
                    letterSpacing: 1.5,
                  }}
                >
                  {item.section}
                </Typography>
              )}
              <ListItem disablePadding sx={{ mb: 0.25 }}>
                <ListItemButton
                  onClick={() => router.push(item.path)}
                  sx={{
                    borderRadius: 1.5,
                    mx: 0.5,
                    py: 0.8,
                    bgcolor: isActive ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                    color: isActive ? 'primary.main' : 'text.secondary',
                    '&:hover': {
                      bgcolor: isActive ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255,255,255,0.04)',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 36,
                      color: isActive ? 'primary.main' : 'text.secondary',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: '0.835rem',
                      fontWeight: isActive ? 600 : 400,
                    }}
                  />
                </ListItemButton>
              </ListItem>
            </Box>
          );
        })}

        {isAdmin && (
          <>
            <Typography
              variant="overline"
              sx={{
                px: 2,
                pt: 2,
                pb: 0.5,
                display: 'block',
                color: 'text.secondary',
                fontSize: '0.65rem',
                letterSpacing: 1.5,
              }}
            >
              Admin
            </Typography>
            <ListItem disablePadding sx={{ mb: 0.25 }}>
              <ListItemButton
                onClick={() => router.push('/admin/users')}
                sx={{
                  borderRadius: 1.5,
                  mx: 0.5,
                  py: 0.8,
                  bgcolor: pathname === '/admin/users' ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                  color: pathname === '/admin/users' ? 'primary.main' : 'text.secondary',
                  '&:hover': {
                    bgcolor: pathname === '/admin/users' ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255,255,255,0.04)',
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 36,
                    color: pathname === '/admin/users' ? 'primary.main' : 'text.secondary',
                  }}
                >
                  <AdminPanelSettingsIcon />
                </ListItemIcon>
                <ListItemText
                  primary="User Management"
                  primaryTypographyProps={{
                    fontSize: '0.835rem',
                    fontWeight: pathname === '/admin/users' ? 600 : 400,
                  }}
                />
              </ListItemButton>
            </ListItem>
          </>
        )}
      </List>
    </Drawer>
  );
}
