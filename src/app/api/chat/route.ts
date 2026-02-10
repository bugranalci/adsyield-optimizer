import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { SYSTEM_PROMPT, buildPerformanceContext } from '@/lib/claude/prompts';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const PAGE_SIZE = 1000;

export async function POST(request: NextRequest) {
  try {
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
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

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
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
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
 * Fetches performance context using the service client (bypasses RLS).
 * Paginates through limelight_stats since Supabase has a 1000 row limit.
 * Also fetches unresolved alert counts.
 */
async function getPerformanceContext(): Promise<string> {
  try {
    const serviceClient = createServiceClient();

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);
    const prevStartDate = new Date();
    prevStartDate.setDate(startDate.getDate() - 7);
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    // Paginate through current period stats
    const stats = await fetchAllStats(
      serviceClient,
      formatDate(startDate),
      formatDate(endDate)
    );

    // Paginate through previous period stats for revenue comparison
    const prevStats = await fetchAllStats(
      serviceClient,
      formatDate(prevStartDate),
      formatDate(startDate)
    );

    // Fetch unresolved alert counts
    const { count: activeAlertCount } = await serviceClient
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('resolved', false);

    const { count: criticalAlertCount } = await serviceClient
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('resolved', false)
      .eq('severity', 'critical');

    if (!stats || stats.length === 0) {
      return 'No performance data available yet. The system needs to sync data from Limelight first.';
    }

    // Current period totals
    const totalRevenue = stats.reduce((s: number, r: any) => s + Number(r.demand_payout || 0), 0);
    const totalImpressions = stats.reduce((s: number, r: any) => s + Number(r.impressions || 0), 0);
    const totalBidRequests = stats.reduce((s: number, r: any) => s + Number(r.bid_requests || 0), 0);
    const avgECPM = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;
    const fillRate = totalBidRequests > 0 ? (totalImpressions / totalBidRequests) * 100 : 0;

    // Previous period revenue for comparison
    const prevRevenue = prevStats.reduce((s: number, r: any) => s + Number(r.demand_payout || 0), 0);
    const revenueChange = prevRevenue > 0
      ? ((totalRevenue - prevRevenue) / prevRevenue) * 100
      : 0;

    // Partner aggregation
    const partnerMap = new Map<string, { revenue: number; impressions: number; bidRequests: number; timeouts: number }>();
    for (const row of stats) {
      const name = row.demand_partner_name || 'Unknown';
      const existing = partnerMap.get(name) || { revenue: 0, impressions: 0, bidRequests: 0, timeouts: 0 };
      existing.revenue += Number(row.demand_payout || 0);
      existing.impressions += Number(row.impressions || 0);
      existing.bidRequests += Number(row.bid_requests || 0);
      existing.timeouts += Number(row.bid_response_timeouts || 0);
      partnerMap.set(name, existing);
    }

    const allPartners = Array.from(partnerMap.entries()).map(([name, s]) => ({
      name,
      revenue: s.revenue,
      ecpm: s.impressions > 0 ? (s.revenue / s.impressions) * 1000 : 0,
      fillRate: s.bidRequests > 0 ? (s.impressions / s.bidRequests) * 100 : 0,
      timeoutRate: s.bidRequests > 0 ? (s.timeouts / s.bidRequests) * 100 : 0,
    }));

    // Top 5 by revenue
    const topPartners = [...allPartners]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Worst 5: low eCPM or high timeout rate
    const worstPartners = [...allPartners]
      .filter(p => p.ecpm < 1 || p.timeoutRate > 15)
      .sort((a, b) => a.ecpm - b.ecpm)
      .slice(0, 5);

    return buildPerformanceContext({
      totalRevenue,
      totalImpressions,
      avgECPM,
      fillRate,
      revenueChange,
      topPartners,
      worstPartners,
      activeAlerts: activeAlertCount || 0,
      criticalAlerts: criticalAlertCount || 0,
      topOpportunities: [],
    });
  } catch (error) {
    console.error('Error building performance context:', error);
    return 'Error loading performance data.';
  }
}

/**
 * Paginates through limelight_stats to fetch all rows for a date range.
 * Supabase enforces a max of 1000 rows per request.
 */
async function fetchAllStats(
  client: ReturnType<typeof createServiceClient>,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const allRows: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await client
      .from('limelight_stats')
      .select('demand_partner_name, impressions, demand_payout, bid_requests, bid_response_timeouts')
      .gte('date', startDate)
      .lte('date', endDate)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Error fetching limelight_stats page:', error);
      break;
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      offset += PAGE_SIZE;
      // If we got fewer rows than PAGE_SIZE, there are no more pages
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allRows;
}
