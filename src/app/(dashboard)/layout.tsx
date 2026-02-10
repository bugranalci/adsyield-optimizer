import { Box } from '@mui/material';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import FloatingChat from '@/components/layout/FloatingChat';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
          minHeight: '100vh',
        }}
      >
        <TopBar />
        <Box sx={{ p: 3, flex: 1, overflow: 'auto' }}>
          {children}
        </Box>
      </Box>
      <FloatingChat />
    </Box>
  );
}
