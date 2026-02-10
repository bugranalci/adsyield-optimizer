import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { SYSTEM_PROMPT, buildPerformanceContext } from '@/lib/claude/prompts';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
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

    // Build performance context from recent data
    const performanceContext = await getPerformanceContext(supabase);

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
      model: 'claude-sonnet-4-20250514',
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

async function getPerformanceContext(supabase: any): Promise<string> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    const { data: stats } = await supabase
      .from('limelight_stats')
      .select('demand_partner_name, impressions, demand_payout, bid_requests, bid_response_timeouts')
      .gte('date', formatDate(startDate))
      .lte('date', formatDate(endDate));

    if (!stats || stats.length === 0) {
      return 'No performance data available yet. The system needs to sync data from Limelight first.';
    }

    const totalRevenue = stats.reduce((s: number, r: any) => s + Number(r.demand_payout || 0), 0);
    const totalImpressions = stats.reduce((s: number, r: any) => s + Number(r.impressions || 0), 0);
    const totalBidRequests = stats.reduce((s: number, r: any) => s + Number(r.bid_requests || 0), 0);
    const avgECPM = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;
    const fillRate = totalBidRequests > 0 ? (totalImpressions / totalBidRequests) * 100 : 0;

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

    const topPartners = allPartners.sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const worstPartners = allPartners.filter(p => p.ecpm < 1 || p.timeoutRate > 15).slice(0, 5);

    return buildPerformanceContext({
      totalRevenue,
      totalImpressions,
      avgECPM,
      fillRate,
      revenueChange: 0, // Would need historical comparison
      topPartners,
      worstPartners,
      activeAlerts: 0,
      criticalAlerts: 0,
      topOpportunities: [],
    });
  } catch (error) {
    console.error('Error building performance context:', error);
    return 'Error loading performance data.';
  }
}
