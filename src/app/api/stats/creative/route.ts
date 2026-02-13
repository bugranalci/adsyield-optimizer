import { readCache } from '@/lib/cache/compute';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get('period') || '7', 10);
    const days = [7, 14, 30].includes(period) ? period : 7;

    if (days === 7) {
      const cached = await readCache('creative_7');
      if (cached) return NextResponse.json(cached);
    }

    return NextResponse.json({
      summary: { totalImpressions: 0, totalBids: 0, totalWins: 0, totalRevenue: 0, totalBidRequests: 0, overallWinRate: 0, overallEcpm: 0, overallBidRate: 0 },
      partners: [], dailyTrend: [], period: days,
    });
  } catch (error) {
    console.error('Creative stats API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
