import { fetchAllRows, getDateRanges } from '@/lib/supabase/helpers';
import { NextRequest, NextResponse } from 'next/server';

const SELECT_COLS = 'date,demand_partner_name,publisher,demand_payout';

interface EntityRevenue {
  name: string;
  revenue: number;
  share: number;
}

function computeConcentration(revenueMap: Map<string, number>, totalRevenue: number) {
  // Build sorted distribution
  const distribution: EntityRevenue[] = Array.from(revenueMap.entries())
    .map(([name, revenue]) => ({
      name,
      revenue,
      share: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Top 5 / Top 10 share
  const top5Share = distribution.slice(0, 5).reduce((s, e) => s + e.share, 0);
  const top10Share = distribution.slice(0, 10).reduce((s, e) => s + e.share, 0);

  // HHI (Herfindahl-Hirschman Index): sum of squared market shares
  // Market share as percentage points, so HHI ranges from ~0 to 10,000
  const hhi = distribution.reduce((sum, e) => sum + e.share * e.share, 0);

  return {
    distribution,
    top5Share: Math.round(top5Share * 100) / 100,
    top10Share: Math.round(top10Share * 100) / 100,
    hhi: Math.round(hhi),
    count: distribution.length,
  };
}

function riskLevel(hhi: number): 'low' | 'medium' | 'high' {
  if (hhi < 1500) return 'low';
  if (hhi <= 2500) return 'medium';
  return 'high';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodDays = Number(searchParams.get('period') || '7');

    const { today } = getDateRanges();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);
    const startStr = startDate.toISOString().split('T')[0];

    const rows = await fetchAllRows('limelight_stats', SELECT_COLS, {
      gte: ['date', startStr],
      lte: ['date', today],
    });

    // Aggregate revenue by demand partner
    const demandMap = new Map<string, number>();
    const publisherMap = new Map<string, number>();
    let totalDemandRevenue = 0;
    let totalPublisherRevenue = 0;

    for (const r of rows) {
      const demandName = r.demand_partner_name || 'Unknown';
      const pubName = r.publisher || 'Unknown';
      const revenue = Number(r.demand_payout || 0);

      demandMap.set(demandName, (demandMap.get(demandName) || 0) + revenue);
      publisherMap.set(pubName, (publisherMap.get(pubName) || 0) + revenue);
      totalDemandRevenue += revenue;
      totalPublisherRevenue += revenue;
    }

    const demand = computeConcentration(demandMap, totalDemandRevenue);
    const publisher = computeConcentration(publisherMap, totalPublisherRevenue);

    const demandRisk = riskLevel(demand.hhi);
    const publisherRisk = riskLevel(publisher.hhi);

    // Overall risk: take the worse of the two
    const riskOrder = { low: 0, medium: 1, high: 2 };
    const overallRisk =
      riskOrder[demandRisk] >= riskOrder[publisherRisk] ? demandRisk : publisherRisk;

    return NextResponse.json({
      demand: {
        hhi: demand.hhi,
        top5Share: demand.top5Share,
        top10Share: demand.top10Share,
        risk: demandRisk,
        count: demand.count,
        distribution: demand.distribution,
      },
      publisher: {
        hhi: publisher.hhi,
        top5Share: publisher.top5Share,
        top10Share: publisher.top10Share,
        risk: publisherRisk,
        count: publisher.count,
        distribution: publisher.distribution,
      },
      overallRisk,
      totalRevenue: totalDemandRevenue,
    });
  } catch (error) {
    console.error('Revenue Concentration API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
