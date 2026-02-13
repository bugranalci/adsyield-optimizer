import { readCache } from '@/lib/cache/compute';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get('period');
    const period = periodParam ? parseInt(periodParam, 10) : 7;
    const safePeriod = [7, 14, 30].includes(period) ? period : 7;

    // For default 7-day period, use cache
    if (safePeriod === 7) {
      const cached = await readCache('bundles_7');
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    // No cache - return empty state
    return NextResponse.json({
      bundles: [],
      summary: { totalBundles: 0, totalRevenue: 0, totalImpressions: 0, avgECPM: 0, overallFillRate: 0 },
      period: safePeriod,
    });
  } catch (error) {
    console.error('[Bundles API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch bundle analytics data' }, { status: 500 });
  }
}
