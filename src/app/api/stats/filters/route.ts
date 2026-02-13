import { readCache } from '@/lib/cache/compute';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get('period') || '7', 10);
    const days = [7, 14, 30].includes(period) ? period : 7;

    if (days === 7) {
      const cached = await readCache('filters_7');
      if (cached) return NextResponse.json(cached);
    }

    return NextResponse.json({
      summary: { totalBidRequests: 0, totalBids: 0, totalWins: 0, totalImpressions: 0, totalTimeouts: 0, totalErrors: 0, totalLostBids: 0, estimatedLostRevenue: 0, overallLossRate: 0, averageEcpm: 0 },
      partners: [], highBidLowWin: [], highTimeouts: [], period: days,
    });
  } catch (error) {
    console.error('Filter analysis API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
