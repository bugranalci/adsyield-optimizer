import { readCache } from '@/lib/cache/compute';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get('period') || '7', 10);
    const days = [7, 14, 30].includes(period) ? period : 7;

    if (days === 7) {
      const cached = await readCache('timeouts_7');
      if (cached) return NextResponse.json(cached);
    }

    return NextResponse.json({ summary: { totalTimeouts: 0, avgTimeoutRate: 0, estimatedRevenueLoss: 0, totalErrors: 0, totalRequests: 0 }, partners: [], dailyTrend: [], period: days });
  } catch (error) {
    console.error('Timeout stats API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
