'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
  Skeleton,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SendIcon from '@mui/icons-material/Send';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const QUICK_PROMPTS = [
  "How's revenue today?",
  'Which partners should I optimize?',
  'Show me timeout issues',
  'Revenue opportunities',
  'Compare yesterday vs today',
  'What bid adjustments should I make?',
];

function TypingIndicator() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, py: 0.5 }}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            animation: 'pulse 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
            '@keyframes pulse': {
              '0%, 80%, 100%': { opacity: 0.3, transform: 'scale(0.8)' },
              '40%': { opacity: 1, transform: 'scale(1)' },
            },
          }}
        />
      ))}
    </Box>
  );
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <Box
      sx={{
        '& > *:last-child': { mb: 0 },
        '& ul, & ol': { pl: 2.5, mb: 1 },
        '& table': {
          borderCollapse: 'collapse',
          width: '100%',
          my: 1,
          '& th, & td': {
            border: '1px solid rgba(255,255,255,0.1)',
            px: 1.5,
            py: 0.75,
            fontSize: '0.85rem',
          },
          '& th': { bgcolor: 'rgba(99,102,241,0.1)', fontWeight: 600 },
        },
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <Typography component="div" variant="body2" sx={{ mb: 1, lineHeight: 1.6 }}>
              {children}
            </Typography>
          ),
          h1: ({ children }) => (
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1, mt: 1.5 }}>
              {children}
            </Typography>
          ),
          h2: ({ children }) => (
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.75, mt: 1.25 }}>
              {children}
            </Typography>
          ),
          h3: ({ children }) => (
            <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5, mt: 1 }}>
              {children}
            </Typography>
          ),
          strong: ({ children }) => <strong>{children}</strong>,
          li: ({ children }) => (
            <li>
              <Typography component="span" variant="body2">{children}</Typography>
            </li>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-');
            if (isBlock) {
              return (
                <Box
                  component="pre"
                  sx={{
                    bgcolor: 'rgba(0,0,0,0.3)',
                    p: 1.5,
                    borderRadius: 1,
                    overflow: 'auto',
                    my: 1,
                    fontSize: '0.85rem',
                    lineHeight: 1.5,
                  }}
                >
                  <code>{children}</code>
                </Box>
              );
            }
            return (
              <code
                style={{
                  background: 'rgba(99,102,241,0.2)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: '0.85rem',
                }}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </Box>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchConversations = useCallback(async () => {
    try {
      setLoadingConversations(true);
      const res = await fetch('/api/chat/history');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const loadConversation = async (convId: string) => {
    if (convId === conversationId) return;
    try {
      setLoadingMessages(true);
      setConversationId(convId);
      setMessages([]);
      const res = await fetch(`/api/chat/history?conversationId=${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const deleteConversation = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/chat/history?conversationId=${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (conversationId === deleteTarget.id) {
          setConversationId(null);
          setMessages([]);
        }
        setConversations((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setInput('');
  };

  const handleSend = async (messageOverride?: string) => {
    const userMessage = (messageOverride || input).trim();
    if (!userMessage || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversationId,
        }),
      });

      if (!response.ok) throw new Error('Chat request failed');

      // Get conversation ID from response headers for new conversations
      const newConvId = response.headers.get('x-conversation-id');
      if (newConvId) {
        setConversationId(newConvId);
        fetchConversations();
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          assistantMessage += chunk;

          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: assistantMessage,
            };
            return updated;
          });
        }
      }

      // Refresh conversation list to get updated title/timestamp
      fetchConversations();
    } catch (err) {
      console.error('Chat error:', err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, an error occurred. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentConversation = conversations.find((c) => c.id === conversationId);

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* Left Sidebar - Conversation List */}
      <Paper
        elevation={0}
        sx={{
          width: 280,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid',
          borderColor: 'divider',
          bgcolor: 'rgba(0,0,0,0.15)',
          borderRadius: 0,
        }}
      >
        {/* New Chat Button */}
        <Box sx={{ p: 2 }}>
          <Box
            onClick={handleNewChat}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              py: 1.25,
              px: 2,
              borderRadius: 2,
              cursor: 'pointer',
              border: '1px dashed',
              borderColor: 'rgba(99,102,241,0.3)',
              transition: 'all 0.2s',
              '&:hover': {
                borderColor: '#6366F1',
                bgcolor: 'rgba(99,102,241,0.08)',
              },
            }}
          >
            <AddIcon sx={{ fontSize: 20, color: '#6366F1' }} />
            <Typography variant="body2" fontWeight={500} color="text.secondary">
              New Chat
            </Typography>
          </Box>
        </Box>

        <Divider />

        {/* Conversation List */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loadingConversations ? (
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {[...Array(5)].map((_, i) => (
                <Box key={i}>
                  <Skeleton variant="text" width="80%" height={20} />
                  <Skeleton variant="text" width="50%" height={16} />
                </Box>
              ))}
            </Box>
          ) : conversations.length === 0 ? (
            <Box sx={{ textAlign: 'center', mt: 6, px: 2 }}>
              <ChatBubbleOutlineIcon sx={{ fontSize: 40, color: 'text.secondary', opacity: 0.3 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                No conversations yet.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Start a new chat to get going.
              </Typography>
            </Box>
          ) : (
            <List sx={{ py: 0.5 }}>
              {conversations.map((conv) => (
                <ListItem
                  key={conv.id}
                  disablePadding
                  secondaryAction={
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(conv);
                      }}
                      sx={{
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        color: 'text.secondary',
                        '.MuiListItem-root:hover &': { opacity: 1 },
                        '&:hover': { color: 'error.main' },
                      }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  }
                  sx={{
                    '&:hover .MuiIconButton-root': { opacity: 1 },
                  }}
                >
                  <ListItemButton
                    selected={conv.id === conversationId}
                    onClick={() => loadConversation(conv.id)}
                    sx={{
                      py: 1.5,
                      px: 2,
                      '&.Mui-selected': {
                        bgcolor: 'rgba(99,102,241,0.12)',
                        borderRight: '2px solid #6366F1',
                        '&:hover': { bgcolor: 'rgba(99,102,241,0.18)' },
                      },
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                    }}
                  >
                    <ListItemText
                      primary={conv.title}
                      secondary={new Date(conv.updated_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      primaryTypographyProps={{
                        variant: 'body2',
                        noWrap: true,
                        fontWeight: conv.id === conversationId ? 600 : 400,
                        sx: { pr: 3 },
                      }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Paper>

      {/* Right Area - Chat */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Chat Header */}
        <Box
          sx={{
            px: 3,
            py: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(99,102,241,0.04))',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <SmartToyIcon sx={{ color: '#6366F1', fontSize: 24 }} />
          <Box>
            <Typography variant="h6" fontWeight={600} sx={{ fontSize: '1.1rem' }}>
              {currentConversation ? currentConversation.title : 'AI Assistant'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {currentConversation
                ? `Started ${new Date(currentConversation.created_at).toLocaleDateString()}`
                : 'Ask about performance, optimizations, and strategies'}
            </Typography>
          </Box>
        </Box>

        {/* Messages */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            px: 3,
            py: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {/* Loading messages skeleton */}
          {loadingMessages && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[...Array(3)].map((_, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    justifyContent: i % 2 === 0 ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Skeleton
                    variant="rounded"
                    width={i % 2 === 0 ? '40%' : '65%'}
                    height={i % 2 === 0 ? 40 : 80}
                    sx={{ borderRadius: 2 }}
                  />
                </Box>
              ))}
            </Box>
          )}

          {/* Empty state with quick prompts */}
          {!loadingMessages && messages.length === 0 && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                gap: 3,
              }}
            >
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.1))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SmartToyIcon sx={{ fontSize: 40, color: '#6366F1' }} />
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                  How can I help you today?
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Ask me about your programmatic advertising performance, optimizations, and revenue
                  strategies.
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1,
                  justifyContent: 'center',
                  maxWidth: 500,
                }}
              >
                {QUICK_PROMPTS.map((prompt) => (
                  <Chip
                    key={prompt}
                    label={prompt}
                    variant="outlined"
                    onClick={() => handleSend(prompt)}
                    sx={{
                      borderColor: 'rgba(99,102,241,0.3)',
                      color: 'text.secondary',
                      cursor: 'pointer',
                      '&:hover': {
                        borderColor: '#6366F1',
                        bgcolor: 'rgba(99,102,241,0.08)',
                        color: 'text.primary',
                      },
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Chat messages */}
          {!loadingMessages &&
            messages.map((msg, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <Box
                  sx={{
                    maxWidth: '70%',
                    px: 2.5,
                    py: 1.5,
                    borderRadius: 2.5,
                    ...(msg.role === 'user'
                      ? {
                          background: 'linear-gradient(135deg, #6366F1, #2f337d)',
                          color: 'white',
                          borderBottomRightRadius: 4,
                        }
                      : {
                          bgcolor: 'rgba(255,255,255,0.06)',
                          borderBottomLeftRadius: 4,
                        }),
                  }}
                >
                  {msg.role === 'user' ? (
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {msg.content}
                    </Typography>
                  ) : (
                    <>
                      {loading && i === messages.length - 1 && !msg.content && <TypingIndicator />}
                      {msg.content && <AssistantMarkdown content={msg.content} />}
                    </>
                  )}
                </Box>
              </Box>
            ))}
          <div ref={messagesEndRef} />
        </Box>

        {/* Input Area */}
        <Box
          sx={{
            px: 3,
            py: 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'rgba(0,0,0,0.1)',
          }}
        >
          <Box sx={{ display: 'flex', gap: 1.5, maxWidth: 800, mx: 'auto' }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              multiline
              maxRows={4}
              disabled={loading}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2.5,
                  bgcolor: 'rgba(255,255,255,0.03)',
                  '& fieldset': {
                    borderColor: 'rgba(255,255,255,0.1)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(99,102,241,0.4)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#6366F1',
                  },
                },
              }}
            />
            <IconButton
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              sx={{
                alignSelf: 'flex-end',
                bgcolor: input.trim() && !loading ? '#6366F1' : 'transparent',
                color: input.trim() && !loading ? 'white' : 'text.disabled',
                width: 40,
                height: 40,
                '&:hover': {
                  bgcolor: input.trim() && !loading ? '#4B44B2' : 'transparent',
                },
                '&.Mui-disabled': {
                  color: 'text.disabled',
                },
              }}
            >
              {loading ? <CircularProgress size={20} /> : <SendIcon />}
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        PaperProps={{
          sx: {
            bgcolor: 'background.paper',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <DialogTitle>Delete Conversation</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &quot;{deleteTarget?.title}&quot;? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} color="inherit">
            Cancel
          </Button>
          <Button onClick={deleteConversation} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
