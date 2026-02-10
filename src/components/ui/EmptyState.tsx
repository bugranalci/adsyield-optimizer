'use client';

import { Box, Card, CardContent, Typography } from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <Card>
      <CardContent sx={{ py: 8, textAlign: 'center' }}>
        <Box sx={{ mb: 2, color: 'text.secondary', opacity: 0.3 }}>
          {icon || <InboxIcon sx={{ fontSize: 56 }} />}
        </Box>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, mx: 'auto' }}>
            {subtitle}
          </Typography>
        )}
        {action && (
          <Box sx={{ mt: 3 }}>
            {action}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
