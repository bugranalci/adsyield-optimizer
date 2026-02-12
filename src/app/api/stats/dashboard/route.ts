import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Helper to fetch all rows from Supabase (bypasses 1000 row default limit)
// Supabase default max_rows is 1000, so we paginate in chunks of 1000
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows(supabase: ReturnType<typeof createServiceClient>, table: string, select: string, filters: { gte?: [string, string]; lte?: [string, string] }): Promise<any[]> {
  const PAGE_SIZE = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allData: any[] = [];
  let offset = 0;

  while (true) {
    let query = supabase.from(table).select(select).range(offset, offset + PAGE_SIZE - 1);
    if (filters.gte) query = query.gte(filters.gte[0], filters.gte[1]);
    if (filters.lte) query = query.lte(filters.lte[0], filters.lte[1]);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allData;
}

export async function GET() {
  try {
    const supabase = createServiceClient();

    // Get last 7 days stats
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);

    const prevEndDate = new Date(startDate);
    const prevStartDate = new Date();
    prevStartDate.setDate(prevEndDate.getDate() - 7);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    // Current period from DB (paginated to get all rows)
    const currentStats = await fetchAllRows(
      supabase,
      'limelight_stats',
      'date,demand_partner_name,publisher,impressions,demand_payout,pub_payout,bid_requests,bids,wins,opportunities,bid_response_timeouts,bid_response_errors',
      { gte: ['date', formatDate(startDate)], lte: ['date', formatDate(endDate)] }
    );

    // Previous period from DB
    const prevStats = await fetchAllRows(
      supabase,
      'limelight_stats',
      'impressions,demand_payout,bid_requests',
      { gte: ['date', formatDate(prevStartDate)], lte: ['date', formatDate(prevEndDate)] }
    );

    const current = currentStats;
    const prev = prevStats;

    // Calculate current metrics
    const totalRevenue = current.reduce((sum, r) => sum + Number(r.demand_payout || 0), 0);
    const totalImpressions = current.reduce((sum, r) => sum + Number(r.impressions || 0), 0);
    const totalBidRequests = current.reduce((sum, r) => sum + Number(r.bid_requests || 0), 0);
    const avgECPM = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;
    const fillRate = totalBidRequests > 0 ? (totalImpressions / totalBidRequests) * 100 : 0;

    // Calculate previous metrics
    const prevRevenue = prev.reduce((sum, r) => sum + Number(r.demand_payout || 0), 0);
    const prevImpressions = prev.reduce((sum, r) => sum + Number(r.impressions || 0), 0);
    const prevBidRequests = prev.reduce((sum, r) => sum + Number(r.bid_requests || 0), 0);
    const prevECPM = prevImpressions > 0 ? (prevRevenue / prevImpressions) * 1000 : 0;
    const prevFillRate = prevBidRequests > 0 ? (prevImpressions / prevBidRequests) * 100 : 0;

    // Calculate changes
    const calcChange = (curr: number, previous: number) =>
      previous > 0 ? ((curr - previous) / previous) * 100 : 0;

    // Top demand partners by revenue (from DB)
    const partnerMap = new Map<string, { revenue: number; impressions: number; bidRequests: number; timeouts: number }>();
    for (const row of current) {
      const name = row.demand_partner_name || 'Unknown';
      if (!name || name === '') continue;
      const existing = partnerMap.get(name) || { revenue: 0, impressions: 0, bidRequests: 0, timeouts: 0 };
      existing.revenue += Number(row.demand_payout || 0);
      existing.impressions += Number(row.impressions || 0);
      existing.bidRequests += Number(row.bid_requests || 0);
      existing.timeouts += Number(row.bid_response_timeouts || 0);
      partnerMap.set(name, existing);
    }

    const topPartners = Array.from(partnerMap.entries())
      .map(([name, stats]) => ({
        name,
        revenue: stats.revenue,
        impressions: stats.impressions,
        ecpm: stats.impressions > 0 ? (stats.revenue / stats.impressions) * 1000 : 0,
        fillRate: stats.bidRequests > 0 ? (stats.impressions / stats.bidRequests) * 100 : 0,
        timeoutRate: stats.bidRequests > 0 ? (stats.timeouts / stats.bidRequests) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Top publishers by revenue (from DB)
    const publisherMap = new Map<string, { revenue: number; impressions: number; pubPayout: number }>();
    for (const row of current) {
      const name = row.publisher || 'Unknown';
      if (!name || name === '') continue;
      const existing = publisherMap.get(name) || { revenue: 0, impressions: 0, pubPayout: 0 };
      existing.revenue += Number(row.demand_payout || 0);
      existing.impressions += Number(row.impressions || 0);
      existing.pubPayout += Number(row.pub_payout || 0);
      publisherMap.set(name, existing);
    }

    const topPublishers = Array.from(publisherMap.entries())
      .map(([name, stats]) => ({
        name,
        revenue: stats.revenue,
        impressions: stats.impressions,
        pubPayout: stats.pubPayout,
        ecpm: stats.impressions > 0 ? (stats.revenue / stats.impressions) * 1000 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Top bundles from DB (pre-synced nightly with BUNDLE dimension)
    const bundleStats = await fetchAllRows(
      supabase,
      'limelight_stats',
      'bundle,impressions,demand_payout',
      {
        gte: ['date', formatDate(startDate)],
        lte: ['date', formatDate(endDate)],
      }
    );

    const bundleMap = new Map<string, { revenue: number; impressions: number }>();
    for (const row of bundleStats) {
      const bundle = row.bundle || '';
      if (!bundle || bundle === '') continue;
      const existing = bundleMap.get(bundle) || { revenue: 0, impressions: 0 };
      existing.revenue += Number(row.demand_payout || 0);
      existing.impressions += Number(row.impressions || 0);
      bundleMap.set(bundle, existing);
    }

    const topBundles = Array.from(bundleMap.entries())
      .filter(([, stats]) => stats.impressions > 0)
      .map(([bundle, stats]) => ({
        bundle,
        revenue: stats.revenue,
        impressions: stats.impressions,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Daily revenue trend (from DB)
    const dailyMap = new Map<string, { revenue: number; impressions: number }>();
    for (const row of current) {
      const date = row.date;
      const existing = dailyMap.get(date) || { revenue: 0, impressions: 0 };
      existing.revenue += Number(row.demand_payout || 0);
      existing.impressions += Number(row.impressions || 0);
      dailyMap.set(date, existing);
    }

    const dailyTrend = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({
        date,
        revenue: stats.revenue,
        impressions: stats.impressions,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      totalRevenue,
      totalImpressions,
      avgECPM,
      fillRate,
      revenueChange: calcChange(totalRevenue, prevRevenue),
      impressionChange: calcChange(totalImpressions, prevImpressions),
      ecpmChange: calcChange(avgECPM, prevECPM),
      fillRateChange: calcChange(fillRate, prevFillRate),
      topPartners,
      topPublishers,
      topBundles,
      dailyTrend,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
