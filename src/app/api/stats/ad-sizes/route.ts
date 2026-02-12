import { createServiceClient } from '@/lib/supabase/server';
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
      .neq('ad_unit_type', '')
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
    const period = parseInt(searchParams.get('period') || '7', 10);

    // Validate period
    const validPeriods = [7, 14, 30];
    const days = validPeriods.includes(period) ? period : 7;

    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1); // Yesterday
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const startStr = formatDate(startDate);
    const endStr = formatDate(endDate);

    console.log(`[Ad Sizes] Reading SIZE data from DB: ${startStr} to ${endStr} (${days} days)`);

    const supabase = createServiceClient();

    // Read from DB (pre-synced nightly with SIZE dimension)
    const rawData = await fetchAllRows(
      supabase,
      'ad_unit_type,impressions,demand_payout,bid_requests,bids,wins',
      startStr,
      endStr
    );

    // Aggregate by ad_unit_type (SIZE) across all dates
    const sizeMap = new Map<string, {
      impressions: number;
      revenue: number;
      bidRequests: number;
      bids: number;
      wins: number;
    }>();

    for (const row of rawData) {
      const size = row.ad_unit_type || 'Unknown';
      const existing = sizeMap.get(size) || {
        impressions: 0,
        revenue: 0,
        bidRequests: 0,
        bids: 0,
        wins: 0,
      };

      existing.impressions += Number(row.impressions || 0);
      existing.revenue += Number(row.demand_payout || 0);
      existing.bidRequests += Number(row.bid_requests || 0);
      existing.bids += Number(row.bids || 0);
      existing.wins += Number(row.wins || 0);

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
      startDate: startStr,
      endDate: endStr,
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
