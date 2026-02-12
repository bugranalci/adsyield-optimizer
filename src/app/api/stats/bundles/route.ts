import { createServiceClient } from '@/lib/supabase/server';
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

// Helper to fetch all rows from Supabase (bypasses 1000 row default limit)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(supabase: ReturnType<typeof createServiceClient>, select: string, startDate: string, endDate: string): Promise<any[]> {
  const PAGE_SIZE = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allData: any[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('limelight_stats')
      .select(select)
      .gte('date', startDate)
      .lte('date', endDate)
      .neq('bundle', '')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allData;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get('period');
    const period = periodParam ? parseInt(periodParam, 10) : 7;

    // Validate period
    const allowedPeriods = [7, 14, 30];
    const safePeriod = allowedPeriods.includes(period) ? period : 7;

    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1); // Yesterday
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - safePeriod);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const startStr = formatDate(startDate);
    const endStr = formatDate(endDate);

    console.log(`[Bundles API] Reading bundle data from DB: ${startStr} to ${endStr} (${safePeriod} days)`);

    const supabase = createServiceClient();

    // Read from DB (pre-synced nightly with BUNDLE dimension)
    const rawData = await fetchAllRows(
      supabase,
      'bundle,impressions,demand_payout,bid_requests,bids,wins,opportunities,bid_response_timeouts,bid_response_errors,pub_payout',
      startStr,
      endStr
    );

    // Aggregate bundles across dates
    const bundleMap = new Map<string, AggregatedBundle>();

    for (const row of rawData) {
      const bundle = row.bundle || 'Unknown';

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

      existing.impressions += Number(row.impressions || 0);
      existing.revenue += Number(row.demand_payout || 0);
      existing.bidRequests += Number(row.bid_requests || 0);
      existing.bids += Number(row.bids || 0);
      existing.wins += Number(row.wins || 0);
      existing.opportunities += Number(row.opportunities || 0);
      existing.timeouts += Number(row.bid_response_timeouts || 0);
      existing.errors += Number(row.bid_response_errors || 0);
      existing.pubPayout += Number(row.pub_payout || 0);

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
      startDate: startStr,
      endDate: endStr,
    });
  } catch (error) {
    console.error('[Bundles API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bundle analytics data' },
      { status: 500 }
    );
  }
}
