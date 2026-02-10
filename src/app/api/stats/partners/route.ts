import { fetchAllRows, getDateRanges } from '@/lib/supabase/helpers';
import { NextRequest, NextResponse } from 'next/server';

interface PartnerAgg {
  revenue: number;
  impressions: number;
  bidRequests: number;
  bids: number;
  wins: number;
  timeouts: number;
  errors: number;
}

interface PublisherAgg {
  revenue: number;
  impressions: number;
  bidRequests: number;
  bids: number;
  wins: number;
  timeouts: number;
  errors: number;
  pubPayout: number;
}

function buildPartnerResult(name: string, agg: PartnerAgg) {
  return {
    name,
    revenue: agg.revenue,
    impressions: agg.impressions,
    bidRequests: agg.bidRequests,
    bids: agg.bids,
    wins: agg.wins,
    timeouts: agg.timeouts,
    errors: agg.errors,
    ecpm: agg.impressions > 0 ? (agg.revenue / agg.impressions) * 1000 : 0,
    fillRate: agg.bidRequests > 0 ? (agg.impressions / agg.bidRequests) * 100 : 0,
    timeoutRate: agg.bidRequests > 0 ? (agg.timeouts / agg.bidRequests) * 100 : 0,
  };
}

function buildPublisherResult(name: string, agg: PublisherAgg) {
  return {
    name,
    revenue: agg.revenue,
    impressions: agg.impressions,
    bidRequests: agg.bidRequests,
    bids: agg.bids,
    wins: agg.wins,
    timeouts: agg.timeouts,
    errors: agg.errors,
    pubPayout: agg.pubPayout,
    ecpm: agg.impressions > 0 ? (agg.revenue / agg.impressions) * 1000 : 0,
    fillRate: agg.bidRequests > 0 ? (agg.impressions / agg.bidRequests) * 100 : 0,
    timeoutRate: agg.bidRequests > 0 ? (agg.timeouts / agg.bidRequests) * 100 : 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get('period') || '7', 10);

    // Validate period
    const validPeriods = [7, 14, 30];
    const days = validPeriods.includes(period) ? period : 7;

    const { today, last7Start, last14Start, last30Start } = getDateRanges();

    let startDate: string;
    if (days === 7) startDate = last7Start;
    else if (days === 14) startDate = last14Start;
    else startDate = last30Start;

    // Fetch all limelight_stats rows for the period
    const rows = await fetchAllRows(
      'limelight_stats',
      'date,demand_partner_name,publisher,impressions,demand_payout,pub_payout,bid_requests,bids,wins,opportunities,bid_response_timeouts,bid_response_errors',
      {
        gte: ['date', startDate],
        lte: ['date', today],
      }
    );

    // Aggregate by demand partner
    const partnerMap = new Map<string, PartnerAgg>();
    // Aggregate by publisher
    const publisherMap = new Map<string, PublisherAgg>();
    // Cross-reference: demand_partner x publisher
    const crossMap = new Map<string, PartnerAgg & { demandPartner: string; publisher: string }>();

    for (const row of rows) {
      const partner = row.demand_partner_name || 'Unknown';
      const publisher = row.publisher || 'Unknown';
      const impressions = Number(row.impressions || 0);
      const revenue = Number(row.demand_payout || 0);
      const pubPayout = Number(row.pub_payout || 0);
      const bidRequests = Number(row.bid_requests || 0);
      const bids = Number(row.bids || 0);
      const wins = Number(row.wins || 0);
      const timeouts = Number(row.bid_response_timeouts || 0);
      const errors = Number(row.bid_response_errors || 0);

      // Demand partner aggregation
      const existing = partnerMap.get(partner) || {
        revenue: 0, impressions: 0, bidRequests: 0, bids: 0, wins: 0, timeouts: 0, errors: 0,
      };
      existing.revenue += revenue;
      existing.impressions += impressions;
      existing.bidRequests += bidRequests;
      existing.bids += bids;
      existing.wins += wins;
      existing.timeouts += timeouts;
      existing.errors += errors;
      partnerMap.set(partner, existing);

      // Publisher aggregation
      const pubExisting = publisherMap.get(publisher) || {
        revenue: 0, impressions: 0, bidRequests: 0, bids: 0, wins: 0, timeouts: 0, errors: 0, pubPayout: 0,
      };
      pubExisting.revenue += revenue;
      pubExisting.impressions += impressions;
      pubExisting.bidRequests += bidRequests;
      pubExisting.bids += bids;
      pubExisting.wins += wins;
      pubExisting.timeouts += timeouts;
      pubExisting.errors += errors;
      pubExisting.pubPayout += pubPayout;
      publisherMap.set(publisher, pubExisting);

      // Cross-reference aggregation
      const crossKey = `${partner}|||${publisher}`;
      const crossExisting = crossMap.get(crossKey) || {
        demandPartner: partner,
        publisher,
        revenue: 0, impressions: 0, bidRequests: 0, bids: 0, wins: 0, timeouts: 0, errors: 0,
      };
      crossExisting.revenue += revenue;
      crossExisting.impressions += impressions;
      crossExisting.bidRequests += bidRequests;
      crossExisting.bids += bids;
      crossExisting.wins += wins;
      crossExisting.timeouts += timeouts;
      crossExisting.errors += errors;
      crossMap.set(crossKey, crossExisting);
    }

    // Build sorted results
    const demandPartners = Array.from(partnerMap.entries())
      .map(([name, agg]) => buildPartnerResult(name, agg))
      .sort((a, b) => b.revenue - a.revenue);

    const publishers = Array.from(publisherMap.entries())
      .map(([name, agg]) => buildPublisherResult(name, agg))
      .sort((a, b) => b.revenue - a.revenue);

    const crossReference = Array.from(crossMap.values())
      .map((entry) => ({
        demandPartner: entry.demandPartner,
        publisher: entry.publisher,
        revenue: entry.revenue,
        impressions: entry.impressions,
        bidRequests: entry.bidRequests,
        ecpm: entry.impressions > 0 ? (entry.revenue / entry.impressions) * 1000 : 0,
        fillRate: entry.bidRequests > 0 ? (entry.impressions / entry.bidRequests) * 100 : 0,
        timeoutRate: entry.bidRequests > 0 ? (entry.timeouts / entry.bidRequests) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      period: days,
      demandPartners,
      publishers,
      crossReference,
    });
  } catch (error) {
    console.error('Partners API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
