import { fetchAllRows, getDateRanges } from '@/lib/supabase/helpers';
import { NextRequest, NextResponse } from 'next/server';

interface PartnerAgg {
  revenue: number;
  impressions: number;
  bidRequests: number;
  bids: number;
  wins: number;
  opportunities: number;
  timeouts: number;
  errors: number;
  publishers: Map<string, { revenue: number; impressions: number }>;
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

    // Fetch all rows for the period
    const rows = await fetchAllRows(
      'limelight_stats',
      'date,demand_partner_name,publisher,impressions,demand_payout,pub_payout,bid_requests,bids,wins,opportunities,bid_response_timeouts,bid_response_errors',
      {
        gte: ['date', startDate],
        lte: ['date', today],
      }
    );

    // Aggregate by demand partner, including per-publisher breakdown
    const partnerMap = new Map<string, PartnerAgg>();

    for (const row of rows) {
      const partner = row.demand_partner_name || 'Unknown';
      const publisher = row.publisher || 'Unknown';
      if (!partner || partner === '') continue;

      const impressions = Number(row.impressions || 0);
      const revenue = Number(row.demand_payout || 0);
      const bidRequests = Number(row.bid_requests || 0);
      const bids = Number(row.bids || 0);
      const wins = Number(row.wins || 0);
      const opportunities = Number(row.opportunities || 0);
      const timeouts = Number(row.bid_response_timeouts || 0);
      const errors = Number(row.bid_response_errors || 0);

      const existing = partnerMap.get(partner) || {
        revenue: 0,
        impressions: 0,
        bidRequests: 0,
        bids: 0,
        wins: 0,
        opportunities: 0,
        timeouts: 0,
        errors: 0,
        publishers: new Map<string, { revenue: number; impressions: number }>(),
      };

      existing.revenue += revenue;
      existing.impressions += impressions;
      existing.bidRequests += bidRequests;
      existing.bids += bids;
      existing.wins += wins;
      existing.opportunities += opportunities;
      existing.timeouts += timeouts;
      existing.errors += errors;

      // Track per-publisher stats for this partner
      if (publisher && publisher !== '' && publisher !== 'Unknown') {
        const pubExisting = existing.publishers.get(publisher) || { revenue: 0, impressions: 0 };
        pubExisting.revenue += revenue;
        pubExisting.impressions += impressions;
        existing.publishers.set(publisher, pubExisting);
      }

      partnerMap.set(partner, existing);
    }

    // Build the appetite results
    const demandPartners = Array.from(partnerMap.entries())
      .map(([name, agg]) => {
        const winRate = agg.bids > 0 ? (agg.wins / agg.bids) * 100 : 0;
        const bidRate = agg.bidRequests > 0 ? (agg.bids / agg.bidRequests) * 100 : 0;
        const avgBidPrice = agg.impressions > 0 ? agg.revenue / agg.impressions : 0;
        const timeoutRate = agg.bidRequests > 0 ? (agg.timeouts / agg.bidRequests) * 100 : 0;
        const fillRate = agg.bidRequests > 0 ? (agg.impressions / agg.bidRequests) * 100 : 0;

        // Top publishers for this partner (by revenue)
        const topPublishers = Array.from(agg.publishers.entries())
          .map(([pubName, pubStats]) => ({
            name: pubName,
            revenue: pubStats.revenue,
            impressions: pubStats.impressions,
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

        return {
          name,
          revenue: agg.revenue,
          impressions: agg.impressions,
          bidRequests: agg.bidRequests,
          bids: agg.bids,
          wins: agg.wins,
          opportunities: agg.opportunities,
          winRate,
          bidRate,
          avgBidPrice,
          timeoutRate,
          fillRate,
          topPublishers,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 30);

    // Summary stats
    const totalPartners = demandPartners.length;
    const avgWinRate =
      demandPartners.length > 0
        ? demandPartners.reduce((sum, p) => sum + p.winRate, 0) / demandPartners.length
        : 0;
    const highestBidder = demandPartners.length > 0
      ? demandPartners.reduce((max, p) => (p.avgBidPrice > max.avgBidPrice ? p : max), demandPartners[0])
      : null;
    const totalRevenue = demandPartners.reduce((sum, p) => sum + p.revenue, 0);
    const totalImpressions = demandPartners.reduce((sum, p) => sum + p.impressions, 0);

    return NextResponse.json({
      period: selectedPeriod,
      summary: {
        totalPartners,
        avgWinRate,
        highestBidder: highestBidder
          ? { name: highestBidder.name, avgBidPrice: highestBidder.avgBidPrice }
          : null,
        totalRevenue,
        totalImpressions,
      },
      demandPartners,
    });
  } catch (error) {
    console.error('Demand Appetite API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
