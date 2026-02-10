import { fetchAllRows, getDateRanges } from '@/lib/supabase/helpers';
import { NextRequest, NextResponse } from 'next/server';

interface PartnerFilterAgg {
  bidRequests: number;
  bids: number;
  wins: number;
  impressions: number;
  timeouts: number;
  errors: number;
  revenue: number;
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
      'date,demand_partner_name,bid_requests,bids,wins,impressions,bid_response_timeouts,bid_response_errors,demand_payout',
      {
        gte: ['date', startDate],
        lte: ['date', today],
      }
    );

    // Calculate global average eCPM for opportunity cost estimation
    const totalImpressions = rows.reduce((sum, r) => sum + Number(r.impressions || 0), 0);
    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.demand_payout || 0), 0);
    const averageEcpm = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;

    // Aggregate by demand partner
    const partnerMap = new Map<string, PartnerFilterAgg>();

    for (const row of rows) {
      const partner = row.demand_partner_name || 'Unknown';

      const existing = partnerMap.get(partner) || {
        bidRequests: 0,
        bids: 0,
        wins: 0,
        impressions: 0,
        timeouts: 0,
        errors: 0,
        revenue: 0,
      };

      existing.bidRequests += Number(row.bid_requests || 0);
      existing.bids += Number(row.bids || 0);
      existing.wins += Number(row.wins || 0);
      existing.impressions += Number(row.impressions || 0);
      existing.timeouts += Number(row.bid_response_timeouts || 0);
      existing.errors += Number(row.bid_response_errors || 0);
      existing.revenue += Number(row.demand_payout || 0);

      partnerMap.set(partner, existing);
    }

    // Build partner filter analysis data
    const partners = Array.from(partnerMap.entries())
      .filter(([, stats]) => stats.bidRequests > 0)
      .map(([name, stats]) => {
        // Loss rate: proportion of bids that did NOT result in an impression
        const lossRate = stats.bids > 0 ? (1 - stats.impressions / stats.bids) * 100 : 0;
        // Timeout rate
        const timeoutRate = stats.bidRequests > 0 ? (stats.timeouts / stats.bidRequests) * 100 : 0;
        // Bid response rate (bids / bid requests) - low = requests being filtered
        const bidResponseRate = stats.bidRequests > 0 ? (stats.bids / stats.bidRequests) * 100 : 0;
        // Fill rate
        const fillRate = stats.bidRequests > 0 ? (stats.impressions / stats.bidRequests) * 100 : 0;
        // Estimated lost revenue from timeouts
        const timeoutRevenueLoss = (stats.timeouts * averageEcpm) / 1000;
        // Lost bids (bids that did not become impressions)
        const lostBids = Math.max(0, stats.bids - stats.impressions);
        // Estimated lost revenue from lost bids
        const lostBidRevenue = (lostBids * averageEcpm) / 1000;

        return {
          name,
          bidRequests: stats.bidRequests,
          bids: stats.bids,
          wins: stats.wins,
          impressions: stats.impressions,
          timeouts: stats.timeouts,
          errors: stats.errors,
          revenue: stats.revenue,
          lossRate: Math.max(0, lossRate),
          timeoutRate,
          bidResponseRate,
          fillRate,
          timeoutRevenueLoss,
          lostBids,
          lostBidRevenue,
        };
      })
      .sort((a, b) => b.lossRate - a.lossRate);

    // Identify opportunity segments
    const highBidLowWin = partners
      .filter((p) => p.bids > 100 && p.lossRate > 30)
      .sort((a, b) => b.lostBidRevenue - a.lostBidRevenue);

    const highTimeouts = partners
      .filter((p) => p.timeoutRate > 5)
      .sort((a, b) => b.timeoutRevenueLoss - a.timeoutRevenueLoss);

    // Summary
    const summaryBidRequests = partners.reduce((sum, p) => sum + p.bidRequests, 0);
    const summaryBids = partners.reduce((sum, p) => sum + p.bids, 0);
    const summaryWins = partners.reduce((sum, p) => sum + p.wins, 0);
    const summaryImpressions = partners.reduce((sum, p) => sum + p.impressions, 0);
    const summaryTimeouts = partners.reduce((sum, p) => sum + p.timeouts, 0);
    const summaryErrors = partners.reduce((sum, p) => sum + p.errors, 0);
    const summaryLostBids = partners.reduce((sum, p) => sum + p.lostBids, 0);
    const summaryTotalLostRevenue = partners.reduce(
      (sum, p) => sum + p.timeoutRevenueLoss + p.lostBidRevenue,
      0
    );
    const summaryOverallLossRate = summaryBids > 0
      ? (1 - summaryImpressions / summaryBids) * 100
      : 0;

    return NextResponse.json({
      summary: {
        totalBidRequests: summaryBidRequests,
        totalBids: summaryBids,
        totalWins: summaryWins,
        totalImpressions: summaryImpressions,
        totalTimeouts: summaryTimeouts,
        totalErrors: summaryErrors,
        totalLostBids: summaryLostBids,
        estimatedLostRevenue: summaryTotalLostRevenue,
        overallLossRate: Math.max(0, summaryOverallLossRate),
        averageEcpm,
      },
      partners,
      highBidLowWin,
      highTimeouts,
      period: selectedPeriod,
    });
  } catch (error) {
    console.error('Filter analysis API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
