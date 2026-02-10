import { fetchLimelightStats, getDateRange } from '@/lib/limelight/client';
import { NextRequest, NextResponse } from 'next/server';

interface AdSizeAggregated {
  size: string;
  impressions: number;
  revenue: number;
  bidRequests: number;
  bids: number;
  wins: number;
  eCPM: number;
  fillRate: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get('period') || '7', 10);

    // Validate period
    const validPeriods = [7, 14, 30];
    const days = validPeriods.includes(period) ? period : 7;

    const { startDate, endDate } = getDateRange(days);

    console.log(`[Ad Sizes] Fetching SIZE data: ${startDate} to ${endDate} (${days} days)`);

    const rawData = await fetchLimelightStats({
      startDate,
      endDate,
      dimensions: ['DATE', 'SIZE'],
      metrics: ['IMPRESSIONS', 'DEMAND_PAYOUT', 'BID_REQUESTS', 'BIDS', 'WINS'],
    });

    // Aggregate by SIZE across all dates
    const sizeMap = new Map<string, {
      impressions: number;
      revenue: number;
      bidRequests: number;
      bids: number;
      wins: number;
    }>();

    for (const row of rawData) {
      const size = (row.SIZE as string) || 'Unknown';
      const existing = sizeMap.get(size) || {
        impressions: 0,
        revenue: 0,
        bidRequests: 0,
        bids: 0,
        wins: 0,
      };

      existing.impressions += Number(row.IMPRESSIONS || 0);
      existing.revenue += Number(row.DEMAND_PAYOUT || 0);
      existing.bidRequests += Number(row.BID_REQUESTS || 0);
      existing.bids += Number(row.BIDS || 0);
      existing.wins += Number(row.WINS || 0);

      sizeMap.set(size, existing);
    }

    // Transform to output format, filter out 0-impression sizes
    const sizes: AdSizeAggregated[] = Array.from(sizeMap.entries())
      .filter(([, stats]) => stats.impressions > 0)
      .map(([size, stats]) => ({
        size,
        impressions: stats.impressions,
        revenue: Math.round(stats.revenue * 100) / 100,
        bidRequests: stats.bidRequests,
        bids: stats.bids,
        wins: stats.wins,
        eCPM: stats.impressions > 0
          ? Math.round((stats.revenue / stats.impressions) * 1000 * 100) / 100
          : 0,
        fillRate: stats.bidRequests > 0
          ? Math.round((stats.impressions / stats.bidRequests) * 100 * 100) / 100
          : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 50);

    // Summary stats
    const totalRevenue = sizes.reduce((sum, s) => sum + s.revenue, 0);
    const totalImpressions = sizes.reduce((sum, s) => sum + s.impressions, 0);
    const avgECPM = totalImpressions > 0
      ? Math.round((totalRevenue / totalImpressions) * 1000 * 100) / 100
      : 0;

    return NextResponse.json({
      period: days,
      startDate,
      endDate,
      totalSizes: sizes.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalImpressions,
      avgECPM,
      sizes,
    });
  } catch (error) {
    console.error('[Ad Sizes] API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ad size data' },
      { status: 500 }
    );
  }
}
