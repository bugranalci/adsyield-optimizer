import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { SYSTEM_PROMPT, buildPerformanceContext } from '@/lib/claude/prompts';
import { readCache } from '@/lib/cache/compute';

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  return new Anthropic({ apiKey });
}

export async function POST(request: NextRequest) {
  try {
    // Validate Anthropic API key early
    let anthropic: Anthropic;
    try {
      anthropic = getAnthropicClient();
    } catch {
      console.error('Chat API: ANTHROPIC_API_KEY is missing');
      return new Response('AI service is not configured. Please contact admin.', { status: 503 });
    }

    // Cookie-based client for auth & user-scoped queries (RLS enabled)
    const supabase = await createClient();

    // Verify auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await request.json();
    const { message, conversationId } = body;

    if (!message) {
      return new Response('Message is required', { status: 400 });
    }

    // Get or create conversation
    let convId = conversationId;
    if (!convId) {
      const { data: conv } = await supabase
        .from('chat_conversations')
        .insert({
          user_id: user.id,
          title: message.substring(0, 100),
        })
        .select()
        .single();

      convId = conv?.id;
    }

    // Save user message
    await supabase.from('chat_messages').insert({
      conversation_id: convId,
      role: 'user',
      content: message,
    });

    // Get conversation history (last 20 messages for context)
    const { data: history } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(20);

    // Build performance context using service client (bypasses RLS for stats)
    const performanceContext = await getPerformanceContext();

    // Build system prompt with context
    const systemPrompt = SYSTEM_PROMPT.replace('{PERFORMANCE_CONTEXT}', performanceContext);

    // Build messages array
    const messages = (history || [])
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // Stream response from Claude
    let stream: ReturnType<typeof anthropic.messages.stream>;
    try {
      stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        system: systemPrompt,
        messages,
      });
    } catch (error) {
      console.error('Chat API: Failed to create Anthropic stream:', error);
      return new Response('Failed to connect to AI service. Please try again later.', { status: 502 });
    }

    // Create a readable stream for the response
    const encoder = new TextEncoder();
    let fullResponse = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const text = event.delta.text;
              fullResponse += text;
              controller.enqueue(encoder.encode(text));
            }
          }

          // Save assistant message after streaming completes
          await supabase.from('chat_messages').insert({
            conversation_id: convId,
            role: 'assistant',
            content: fullResponse,
          });

          // Update conversation timestamp
          await supabase
            .from('chat_conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', convId);

          controller.close();
        } catch (error: unknown) {
          console.error('Stream error:', error);
          // Send a readable error message to the user instead of crashing
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          let userMessage = '\n\n[Error: AI response interrupted. Please try again.]';
          if (errMsg.includes('authentication') || errMsg.includes('401')) {
            userMessage = '\n\n[Error: AI service authentication failed. Please contact admin.]';
          } else if (errMsg.includes('rate') || errMsg.includes('429')) {
            userMessage = '\n\n[Error: AI service rate limit reached. Please wait a moment and try again.]';
          } else if (errMsg.includes('overloaded') || errMsg.includes('529')) {
            userMessage = '\n\n[Error: AI service is temporarily overloaded. Please try again shortly.]';
          }
          try {
            controller.enqueue(encoder.encode(userMessage));
            controller.close();
          } catch {
            controller.error(error);
          }
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Conversation-Id': convId || '',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

/**
 * Reads performance context from pre-computed cache (refreshed daily at 00:10 UTC).
 * Falls back to a minimal context if cache is not yet populated.
 * Zero Supabase queries for limelight_stats - only 1 cache read + 2 alert counts.
 */
async function getPerformanceContext(): Promise<string> {
  try {
    // Read pre-computed chat context from cache (1 query instead of 20+)
    const cached = await readCache('chat_context_7');

    if (!cached) {
      return 'No performance data available yet. Cache will be populated at next daily refresh (00:10 UTC).';
    }

    // Only 2 lightweight count queries for live alert status
    const serviceClient = createServiceClient();
    const [alertResult, criticalResult] = await Promise.all([
      serviceClient.from('alerts').select('*', { count: 'exact', head: true }).eq('resolved', false),
      serviceClient.from('alerts').select('*', { count: 'exact', head: true }).eq('resolved', false).eq('severity', 'critical'),
    ]);

    return buildPerformanceContext({
      totalRevenue: cached.totalRevenue,
      totalImpressions: cached.totalImpressions,
      avgECPM: cached.avgECPM,
      fillRate: cached.fillRate,
      revenueChange: cached.revenueChange,
      topPartners: cached.topPartners || [],
      worstPartners: cached.worstPartners || [],
      activeAlerts: (alertResult as { count: number | null }).count ?? 0,
      criticalAlerts: (criticalResult as { count: number | null }).count ?? 0,
      topOpportunities: [],
    });
  } catch (error) {
    console.error('Error building performance context:', error);
    return 'Error loading performance data.';
  }
}
