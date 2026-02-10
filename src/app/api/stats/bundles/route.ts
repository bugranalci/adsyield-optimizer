import { fetchLimelightStats, getDateRange } from '@/lib/limelight/client';
import { NextRequest, NextResponse } from 'next/server';

interface AggregatedBundle {
  bundle: string;
  impressions: number;
  revenue: number;
  bidRequests: number;
  bids: number;
  wins: number;
  opportunities: number;
  timeouts: number;
  errors: number;
  pubPayout: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get('period');
    const period = periodParam ? parseInt(periodParam, 10) : 7;

    // Validate period
    const allowedPeriods = [7, 14, 30];
    const safePeriod = allowedPeriods.includes(period) ? period : 7;

    const { startDate, endDate } = getDateRange(safePeriod);

    console.log(`[Bundles API] Fetching bundle data: ${startDate} to ${endDate} (${safePeriod} days)`);

    // Fetch directly from Limelight API with BUNDLE dimension
    const rawData = await fetchLimelightStats({
      startDate,
      endDate,
      dimensions: ['DATE', 'BUNDLE'],
      // All metrics for comprehensive bundle analytics
    });

    // Aggregate bundles across dates
    const bundleMap = new Map<string, AggregatedBundle>();

    for (const row of rawData) {
      const bundle = (row.BUNDLE as string) || 'Unknown';

      const existing = bundleMap.get(bundle) || {
        bundle,
        impressions: 0,
        revenue: 0,
        bidRequests: 0,
        bids: 0,
        wins: 0,
        opportunities: 0,
        timeouts: 0,
        errors: 0,
        pubPayout: 0,
      };

      existing.impressions += Number(row.IMPRESSIONS || 0);
      existing.revenue += Number(row.DEMAND_PAYOUT || 0);
      existing.bidRequests += Number(row.BID_REQUESTS || 0);
      existing.bids += Number(row.BIDS || 0);
      existing.wins += Number(row.WINS || 0);
      existing.opportunities += Number(row.OPPORTUNITIES || 0);
      existing.timeouts += Number(row.BID_RESPONSE_TIMEOUTS || 0);
      existing.errors += Number(row.BID_RESPONSE_ERRORS || 0);
      existing.pubPayout += Number(row.PUB_PAYOUT || 0);

      bundleMap.set(bundle, existing);
    }

    // Filter out bundles with 0 impressions, compute derived metrics, sort by revenue
    const bundles = Array.from(bundleMap.values())
      .filter((b) => b.impressions > 0)
      .map((b) => ({
        bundle: b.bundle,
        impressions: b.impressions,
        revenue: b.revenue,
        bidRequests: b.bidRequests,
        bids: b.bids,
        wins: b.wins,
        opportunities: b.opportunities,
        timeouts: b.timeouts,
        errors: b.errors,
        pubPayout: b.pubPayout,
        ecpm: b.impressions > 0 ? (b.revenue / b.impressions) * 1000 : 0,
        fillRate: b.bidRequests > 0 ? (b.impressions / b.bidRequests) * 100 : 0,
        bidRate: b.bidRequests > 0 ? (b.bids / b.bidRequests) * 100 : 0,
        winRate: b.bids > 0 ? (b.wins / b.bids) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 100);

    // Summary metrics
    const totalBundles = bundles.length;
    const totalRevenue = bundles.reduce((sum, b) => sum + b.revenue, 0);
    const totalImpressions = bundles.reduce((sum, b) => sum + b.impressions, 0);
    const avgECPM = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;
    const totalBidRequests = bundles.reduce((sum, b) => sum + b.bidRequests, 0);
    const overallFillRate = totalBidRequests > 0 ? (totalImpressions / totalBidRequests) * 100 : 0;

    console.log(`[Bundles API] Returning ${bundles.length} bundles, total revenue: $${totalRevenue.toFixed(2)}`);

    return NextResponse.json({
      bundles,
      summary: {
        totalBundles,
        totalRevenue,
        totalImpressions,
        avgECPM,
        overallFillRate,
      },
      period: safePeriod,
      startDate,
      endDate,
    });
  } catch (error) {
    console.error('[Bundles API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bundle analytics data' },
      { status: 500 }
    );
  }
}
