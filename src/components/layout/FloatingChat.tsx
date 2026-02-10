'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Fab,
  Paper,
  Typography,
  TextField,
  IconButton,
  Slide,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Chip,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import HistoryIcon from '@mui/icons-material/History';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
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
];

function TypingIndicator() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.5 }}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: 7,
            height: 7,
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

export default function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/history');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchConversations();
    }
  }, [open, fetchConversations]);

  const loadConversation = async (convId: string) => {
    try {
      const res = await fetch(`/api/chat/history?conversationId=${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setConversationId(convId);
        setShowHistory(false);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
    setInput('');
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(convId);
    try {
      const res = await fetch(`/api/chat/history?conversationId=${convId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (conversationId === convId) {
          setConversationId(null);
          setMessages([]);
        }
        setConversations((prev) => prev.filter((c) => c.id !== convId));
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    } finally {
      setDeletingId(null);
    }
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
    <>
      {/* Floating Button */}
      <Fab
        color="primary"
        onClick={() => setOpen(!open)}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1300,
          background: 'linear-gradient(135deg, #6366F1, #2f337d)',
          '&:hover': {
            background: 'linear-gradient(135deg, #818CF8, #6366F1)',
          },
        }}
      >
        {open ? <CloseIcon /> : <SmartToyIcon />}
      </Fab>

      {/* Chat Panel */}
      <Slide direction="up" in={open} mountOnEnter unmountOnExit>
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            bottom: 88,
            right: 24,
            width: 420,
            height: 560,
            zIndex: 1300,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden',
            bgcolor: '#3a3a3c',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 1.5,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(47,51,125,0.15))',
              borderBottom: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 56,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden', flex: 1 }}>
              <SmartToyIcon sx={{ color: '#6366F1', fontSize: 22, flexShrink: 0 }} />
              <Box sx={{ overflow: 'hidden' }}>
                <Typography variant="subtitle2" fontWeight={600} noWrap>
                  {currentConversation ? currentConversation.title : 'AI Assistant'}
                </Typography>
                {!currentConversation && (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    Ask about performance &amp; optimizations
                  </Typography>
                )}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
              <IconButton
                size="small"
                onClick={handleNewChat}
                title="New chat"
                sx={{ color: 'text.secondary', '&:hover': { color: '#6366F1' } }}
              >
                <AddIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => {
                  if (!showHistory) fetchConversations();
                  setShowHistory(!showHistory);
                }}
                title="Chat history"
                sx={{
                  color: showHistory ? '#6366F1' : 'text.secondary',
                  '&:hover': { color: '#6366F1' },
                }}
              >
                <HistoryIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => setOpen(false)}
                title="Close"
                sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {/* Body: History panel or Chat area */}
          <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
            {/* History sidebar */}
            <Slide direction="right" in={showHistory} mountOnEnter unmountOnExit>
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 2,
                  bgcolor: '#3a3a3c',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box
                  sx={{
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <IconButton size="small" onClick={() => setShowHistory(false)}>
                    <ArrowBackIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="subtitle2" fontWeight={600}>
                    Conversations
                  </Typography>
                </Box>
                <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
                  {conversations.length === 0 && (
                    <Box sx={{ textAlign: 'center', mt: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No conversations yet
                      </Typography>
                    </Box>
                  )}
                  {conversations.map((conv) => (
                    <ListItem
                      key={conv.id}
                      disablePadding
                      secondaryAction={
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={(e) => handleDeleteConversation(conv.id, e)}
                          disabled={deletingId === conv.id}
                          sx={{
                            opacity: 0,
                            transition: 'opacity 0.2s',
                            color: 'text.secondary',
                            '&:hover': { color: 'error.main' },
                          }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 18 }} />
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
                            '&:hover': { bgcolor: 'rgba(99,102,241,0.18)' },
                          },
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                        }}
                      >
                        <ListItemText
                          primary={conv.title}
                          secondary={new Date(conv.updated_at).toLocaleDateString()}
                          primaryTypographyProps={{
                            variant: 'body2',
                            noWrap: true,
                            fontWeight: conv.id === conversationId ? 600 : 400,
                            sx: { pr: 2 },
                          }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </Box>
            </Slide>

            {/* Messages area */}
            <Box
              sx={{
                flex: 1,
                overflow: 'auto',
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
              }}
            >
              {/* Empty state with quick prompts */}
              {messages.length === 0 && (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 1,
                    gap: 2,
                  }}
                >
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(47,51,125,0.1))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <SmartToyIcon sx={{ fontSize: 28, color: '#6366F1' }} />
                  </Box>
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    Ask me anything about your programmatic performance
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', px: 1 }}>
                    {QUICK_PROMPTS.map((prompt) => (
                      <Chip
                        key={prompt}
                        label={prompt}
                        variant="outlined"
                        size="small"
                        onClick={() => handleSend(prompt)}
                        sx={{
                          borderColor: 'rgba(99,102,241,0.3)',
                          color: 'text.secondary',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
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

              {/* Messages */}
              {messages.map((msg, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Box
                    sx={{
                      maxWidth: '85%',
                      px: 2,
                      py: 1,
                      borderRadius: 2,
                      bgcolor:
                        msg.role === 'user'
                          ? 'linear-gradient(135deg, #6366F1, #2f337d)'
                          : 'rgba(255,255,255,0.06)',
                      background:
                        msg.role === 'user'
                          ? 'linear-gradient(135deg, #6366F1, #2f337d)'
                          : undefined,
                      color: msg.role === 'user' ? 'white' : 'text.primary',
                    }}
                  >
                    {msg.role === 'user' ? (
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                        {msg.content}
                      </Typography>
                    ) : (
                      <>
                        {/* Typing indicator for empty streaming assistant message */}
                        {loading && i === messages.length - 1 && !msg.content && <TypingIndicator />}
                        {msg.content && (
                          <Box
                            sx={{
                              '& > *:last-child': { mb: 0 },
                              '& ul, & ol': { pl: 2, mb: 1 },
                              '& table': {
                                borderCollapse: 'collapse',
                                width: '100%',
                                my: 1,
                                '& th, & td': {
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  px: 1,
                                  py: 0.5,
                                  fontSize: '0.8rem',
                                },
                                '& th': { bgcolor: 'rgba(99,102,241,0.1)' },
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
                                          fontSize: '0.8rem',
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
                                        fontSize: '0.8rem',
                                      }}
                                    >
                                      {children}
                                    </code>
                                  );
                                },
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </Box>
                        )}
                      </>
                    )}
                  </Box>
                </Box>
              ))}
              <div ref={messagesEndRef} />
            </Box>
          </Box>

          {/* Input */}
          <Divider />
          <Box sx={{ p: 1.5, display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Type your question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              multiline
              maxRows={3}
              disabled={loading}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
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
                color: input.trim() && !loading ? '#6366F1' : 'text.disabled',
                '&:hover': { bgcolor: 'rgba(99,102,241,0.1)' },
              }}
            >
              <SendIcon />
            </IconButton>
          </Box>
        </Paper>
      </Slide>
    </>
  );
}
