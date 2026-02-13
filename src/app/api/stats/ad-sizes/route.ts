import { readCache } from '@/lib/cache/compute';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get('period') || '7', 10);
    const days = [7, 14, 30].includes(period) ? period : 7;

    if (days === 7) {
      const cached = await readCache('ad_sizes_7');
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    return NextResponse.json({
      period: days, totalSizes: 0, totalRevenue: 0, totalImpressions: 0, avgECPM: 0, sizes: [],
    });
  } catch (error) {
    console.error('[Ad Sizes] API error:', error);
    return NextResponse.json({ error: 'Failed to fetch ad size data' }, { status: 500 });
  }
}
