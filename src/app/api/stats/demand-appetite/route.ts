import { readCache } from '@/lib/cache/compute';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get('period') || '7', 10);
    const days = [7, 14, 30].includes(period) ? period : 7;

    if (days === 7) {
      const cached = await readCache('demand_appetite_7');
      if (cached) return NextResponse.json(cached);
    }

    return NextResponse.json({ period: days, summary: { totalPartners: 0, avgWinRate: 0, highestBidder: null, totalRevenue: 0, totalImpressions: 0 }, demandPartners: [] });
  } catch (error) {
    console.error('Demand Appetite API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
