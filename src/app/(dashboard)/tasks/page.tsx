'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Chip,
  Skeleton,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';

interface Task {
  id: string;
  title: string;
  description: string | null;
  type: string;
  priority: 'critical' | 'important' | 'growth';
  status: 'todo' | 'in-progress' | 'completed';
  effort: string | null;
  estimated_revenue: number | null;
  created_at: string;
  updated_at: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#FF5252',
  important: '#FFB74D',
  growth: '#4CAF50',
};

const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'important', label: 'Important' },
  { value: 'growth', label: 'Growth' },
];

const TYPE_OPTIONS = [
  { value: 'optimization', label: 'Optimization' },
  { value: 'integration', label: 'Integration' },
  { value: 'investigation', label: 'Investigation' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'feature', label: 'Feature' },
];

const EFFORT_OPTIONS = [
  { value: 'low', label: 'Low (< 1 hr)' },
  { value: 'medium', label: 'Medium (1-4 hrs)' },
  { value: 'high', label: 'High (4+ hrs)' },
];

const STATUS_FLOW: Record<string, string> = {
  todo: 'in-progress',
  'in-progress': 'completed',
  completed: 'todo',
};

function getNextStatus(current: string): string {
  return STATUS_FLOW[current] || 'todo';
}

function TaskCard({
  task,
  onToggleStatus,
}: {
  task: Task;
  onToggleStatus: (id: string, newStatus: string) => void;
}) {
  const priorityColor = PRIORITY_COLORS[task.priority] || '#9AA0A6';

  return (
    <Card
      sx={{
        mb: 1.5,
        borderLeft: `4px solid ${priorityColor}`,
        transition: 'transform 0.15s, box-shadow 0.15s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 4px 12px rgba(0,0,0,0.3)`,
        },
      }}
    >
      <CardActionArea
        onClick={() => onToggleStatus(task.id, getNextStatus(task.status))}
        sx={{ p: 0 }}
      >
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
            <Chip
              label={task.priority}
              size="small"
              sx={{
                bgcolor: `${priorityColor}22`,
                color: priorityColor,
                fontWeight: 600,
                fontSize: '0.7rem',
                height: 22,
                textTransform: 'capitalize',
              }}
            />
            {task.type && (
              <Chip
                label={task.type}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: '0.65rem',
                  height: 20,
                  textTransform: 'capitalize',
                  borderColor: 'rgba(255,255,255,0.15)',
                  color: 'text.secondary',
                }}
              />
            )}
          </Box>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 1, mb: 0.5 }}>
            {task.title}
          </Typography>
          {task.description && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mb: 1,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                fontSize: '0.8rem',
              }}
            >
              {task.description}
            </Typography>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
            {task.effort && (
              <Typography variant="caption" color="text.secondary">
                Effort: {task.effort}
              </Typography>
            )}
            {task.estimated_revenue != null && task.estimated_revenue > 0 && (
              <Typography variant="caption" color="secondary.main" fontWeight={600}>
                +${task.estimated_revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
              </Typography>
            )}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

function KanbanColumn({
  title,
  icon,
  tasks,
  color,
  onToggleStatus,
}: {
  title: string;
  icon: React.ReactNode;
  tasks: Task[];
  color: string;
  onToggleStatus: (id: string, newStatus: string) => void;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 280,
        bgcolor: 'rgba(255,255,255,0.02)',
        borderRadius: 2,
        p: 2,
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box sx={{ color }}>{icon}</Box>
        <Typography variant="subtitle1" fontWeight={700}>
          {title}
        </Typography>
        <Chip
          label={tasks.length}
          size="small"
          sx={{
            ml: 'auto',
            height: 22,
            fontSize: '0.75rem',
            fontWeight: 700,
            bgcolor: `${color}22`,
            color,
          }}
        />
      </Box>
      <Box sx={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto', pr: 0.5 }}>
        {tasks.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4, opacity: 0.5 }}>
            No tasks
          </Typography>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} onToggleStatus={onToggleStatus} />
          ))
        )}
      </Box>
    </Box>
  );
}

export default function TasksPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'optimization',
    priority: 'important',
    effort: 'medium',
    estimated_revenue: '',
  });

  const { data, isLoading, error } = useQuery<{ tasks: Task[] }>({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await fetch('/api/tasks');
      if (!res.ok) throw new Error('Failed to fetch tasks');
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newTask: typeof formData) => {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTask.title,
          description: newTask.description || null,
          type: newTask.type,
          priority: newTask.priority,
          effort: newTask.effort || null,
          estimated_revenue: newTask.estimated_revenue ? parseFloat(newTask.estimated_revenue) : null,
        }),
      });
      if (!res.ok) throw new Error('Failed to create task');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setDialogOpen(false);
      setFormData({
        title: '',
        description: '',
        type: 'optimization',
        priority: 'important',
        effort: 'medium',
        estimated_revenue: '',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error('Failed to update task');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const handleToggleStatus = (id: string, newStatus: string) => {
    updateMutation.mutate({ id, status: newStatus });
  };

  const handleCreate = () => {
    if (!formData.title.trim()) return;
    createMutation.mutate(formData);
  };

  const tasks = data?.tasks || [];
  const todoTasks = tasks.filter((t) => t.status === 'todo');
  const inProgressTasks = tasks.filter((t) => t.status === 'in-progress');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  if (isLoading) {
    return (
      <Box>
        <PageHeader title="Task Manager" subtitle="Click a task card to advance its status" />
        <Grid container spacing={3}>
          {[1, 2, 3].map((i) => (
            <Grid size={{ xs: 12, md: 4 }} key={i}>
              <Skeleton variant="rounded" height={400} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader title="Task Manager" subtitle="Click a task card to advance its status: Todo &rarr; In Progress &rarr; Completed">
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
          sx={{
            background: 'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #5558E3 0%, #6366F1 100%)',
            },
          }}
        >
          Add Task
        </Button>
      </PageHeader>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load tasks. Make sure the optimization_tasks table exists in Supabase.
        </Alert>
      )}

      {/* Kanban Board */}
      <Box
        sx={{
          display: 'flex',
          gap: 2.5,
          overflowX: 'auto',
          pb: 2,
        }}
      >
        <KanbanColumn
          title="Todo"
          icon={<AssignmentIcon />}
          tasks={todoTasks}
          color="#29B6F6"
          onToggleStatus={handleToggleStatus}
        />
        <KanbanColumn
          title="In Progress"
          icon={<PlayArrowIcon />}
          tasks={inProgressTasks}
          color="#FFB74D"
          onToggleStatus={handleToggleStatus}
        />
        <KanbanColumn
          title="Completed"
          icon={<CheckCircleIcon />}
          tasks={completedTasks}
          color="#4CAF50"
          onToggleStatus={handleToggleStatus}
        />
      </Box>

      {/* Add Task Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            backgroundImage: 'none',
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Create New Task</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="Title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            fullWidth
            required
            autoFocus
          />
          <TextField
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            fullWidth
            multiline
            rows={3}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              select
              label="Type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              fullWidth
            >
              {TYPE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Priority"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              fullWidth
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: PRIORITY_COLORS[opt.value],
                      }}
                    />
                    {opt.label}
                  </Box>
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              select
              label="Effort"
              value={formData.effort}
              onChange={(e) => setFormData({ ...formData, effort: e.target.value })}
              fullWidth
            >
              {EFFORT_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Est. Revenue ($/mo)"
              value={formData.estimated_revenue}
              onChange={(e) => setFormData({ ...formData, estimated_revenue: e.target.value })}
              fullWidth
              type="number"
              slotProps={{
                input: {
                  inputProps: { min: 0, step: 100 },
                },
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            disabled={!formData.title.trim() || createMutation.isPending}
            sx={{
              background: 'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5558E3 0%, #6366F1 100%)',
              },
            }}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Task'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
