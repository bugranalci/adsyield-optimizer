'use client';
import { Box, Typography } from '@mui/material';

export default function ChatPage() {
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        AI Chat
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Use the floating chat widget in the bottom-right corner
      </Typography>
    </Box>
  );
}
