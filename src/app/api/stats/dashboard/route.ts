import { readCache } from '@/lib/cache/compute';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const cached = await readCache('dashboard');
    if (cached) {
      return NextResponse.json(cached);
    }

    // No cache yet - return empty state (sync hasn't run)
    return NextResponse.json({
      totalRevenue: 0, totalImpressions: 0, avgECPM: 0, fillRate: 0,
      revenueChange: 0, impressionChange: 0, ecpmChange: 0, fillRateChange: 0,
      topPartners: [], topPublishers: [], topBundles: [], dailyTrend: [],
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
