import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // Get last 7 days stats
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);

    const prevEndDate = new Date(startDate);
    const prevStartDate = new Date();
    prevStartDate.setDate(prevEndDate.getDate() - 7);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    // Current period
    const { data: currentStats } = await supabase
      .from('limelight_stats')
      .select('*')
      .gte('date', formatDate(startDate))
      .lte('date', formatDate(endDate));

    // Previous period
    const { data: prevStats } = await supabase
      .from('limelight_stats')
      .select('*')
      .gte('date', formatDate(prevStartDate))
      .lte('date', formatDate(prevEndDate));

    const current = currentStats || [];
    const prev = prevStats || [];

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
    const calcChange = (curr: number, prev: number) =>
      prev > 0 ? ((curr - prev) / prev) * 100 : 0;

    // Top partners by revenue
    const partnerMap = new Map<string, { revenue: number; impressions: number; bidRequests: number }>();
    for (const row of current) {
      const name = row.demand_partner_name || 'Unknown';
      const existing = partnerMap.get(name) || { revenue: 0, impressions: 0, bidRequests: 0 };
      existing.revenue += Number(row.demand_payout || 0);
      existing.impressions += Number(row.impressions || 0);
      existing.bidRequests += Number(row.bid_requests || 0);
      partnerMap.set(name, existing);
    }

    const topPartners = Array.from(partnerMap.entries())
      .map(([name, stats]) => ({
        name,
        revenue: stats.revenue,
        impressions: stats.impressions,
        ecpm: stats.impressions > 0 ? (stats.revenue / stats.impressions) * 1000 : 0,
        fillRate: stats.bidRequests > 0 ? (stats.impressions / stats.bidRequests) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Top bundles by revenue
    const bundleMap = new Map<string, { revenue: number; impressions: number }>();
    for (const row of current) {
      const bundle = row.bundle || 'Unknown';
      const existing = bundleMap.get(bundle) || { revenue: 0, impressions: 0 };
      existing.revenue += Number(row.demand_payout || 0);
      existing.impressions += Number(row.impressions || 0);
      bundleMap.set(bundle, existing);
    }

    const topBundles = Array.from(bundleMap.entries())
      .map(([bundle, stats]) => ({
        bundle,
        revenue: stats.revenue,
        impressions: stats.impressions,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

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
      topBundles,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
