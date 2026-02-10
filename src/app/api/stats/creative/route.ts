import { fetchAllRows, getDateRanges } from '@/lib/supabase/helpers';
import { NextRequest, NextResponse } from 'next/server';

interface PartnerCreativeAgg {
  impressions: number;
  bids: number;
  wins: number;
  revenue: number;
  bidRequests: number;
  opportunities: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get('period') || '7', 10);

    // Validate period
    const validPeriods = [7, 14, 30];
    const selectedPeriod = validPeriods.includes(period) ? period : 7;

    // Calculate date range
    const { today, last7Start, last14Start, last30Start } = getDateRanges();
    let startDate: string;
    switch (selectedPeriod) {
      case 14:
        startDate = last14Start;
        break;
      case 30:
        startDate = last30Start;
        break;
      default:
        startDate = last7Start;
    }

    // Fetch all limelight_stats rows for the period
    const rows = await fetchAllRows(
      'limelight_stats',
      'date,demand_partner_name,impressions,demand_payout,bid_requests,bids,wins,opportunities',
      {
        gte: ['date', startDate],
        lte: ['date', today],
      }
    );

    // Aggregate by demand partner (proxy for creative performance)
    const partnerMap = new Map<string, PartnerCreativeAgg>();

    for (const row of rows) {
      const partner = row.demand_partner_name || 'Unknown';

      const existing = partnerMap.get(partner) || {
        impressions: 0,
        bids: 0,
        wins: 0,
        revenue: 0,
        bidRequests: 0,
        opportunities: 0,
      };

      existing.impressions += Number(row.impressions || 0);
      existing.bids += Number(row.bids || 0);
      existing.wins += Number(row.wins || 0);
      existing.revenue += Number(row.demand_payout || 0);
      existing.bidRequests += Number(row.bid_requests || 0);
      existing.opportunities += Number(row.opportunities || 0);

      partnerMap.set(partner, existing);
    }

    // Build partner creative data with derived metrics
    const partners = Array.from(partnerMap.entries())
      .filter(([, stats]) => stats.bids > 0 || stats.impressions > 0)
      .map(([name, stats]) => {
        const winRate = stats.bids > 0 ? (stats.wins / stats.bids) * 100 : 0;
        const renderRate = stats.wins > 0 ? (stats.impressions / stats.wins) * 100 : 0;
        const ecpm = stats.impressions > 0 ? (stats.revenue / stats.impressions) * 1000 : 0;
        const bidRate = stats.bidRequests > 0 ? (stats.bids / stats.bidRequests) * 100 : 0;

        return {
          name,
          impressions: stats.impressions,
          bids: stats.bids,
          wins: stats.wins,
          revenue: stats.revenue,
          bidRequests: stats.bidRequests,
          opportunities: stats.opportunities,
          winRate,
          renderRate,
          ecpm,
          bidRate,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    // Summary metrics
    const totalImpressions = partners.reduce((sum, p) => sum + p.impressions, 0);
    const totalBids = partners.reduce((sum, p) => sum + p.bids, 0);
    const totalWins = partners.reduce((sum, p) => sum + p.wins, 0);
    const totalRevenue = partners.reduce((sum, p) => sum + p.revenue, 0);
    const totalBidRequests = partners.reduce((sum, p) => sum + p.bidRequests, 0);
    const overallWinRate = totalBids > 0 ? (totalWins / totalBids) * 100 : 0;
    const overallEcpm = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;
    const overallBidRate = totalBidRequests > 0 ? (totalBids / totalBidRequests) * 100 : 0;

    // Daily trend for sparkline/chart
    const dailyMap = new Map<string, { impressions: number; wins: number; revenue: number }>();
    for (const row of rows) {
      const date = row.date;
      const existing = dailyMap.get(date) || { impressions: 0, wins: 0, revenue: 0 };
      existing.impressions += Number(row.impressions || 0);
      existing.wins += Number(row.wins || 0);
      existing.revenue += Number(row.demand_payout || 0);
      dailyMap.set(date, existing);
    }

    const dailyTrend = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({
        date,
        impressions: stats.impressions,
        wins: stats.wins,
        revenue: stats.revenue,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      summary: {
        totalImpressions,
        totalBids,
        totalWins,
        totalRevenue,
        totalBidRequests,
        overallWinRate,
        overallEcpm,
        overallBidRate,
      },
      partners,
      dailyTrend,
      period: selectedPeriod,
    });
  } catch (error) {
    console.error('Creative stats API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
