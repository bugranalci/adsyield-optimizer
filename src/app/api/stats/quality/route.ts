import { fetchAllRows, getDateRanges } from '@/lib/supabase/helpers';
import { NextRequest, NextResponse } from 'next/server';

const SELECT_COLS =
  'date,publisher,impressions,demand_payout,bid_requests,bids,wins,bid_response_timeouts';

// Normalize a value to 0-90 based on an optimal target.
// Values at or above optimal get 90; below scales linearly.
function normalizeToOptimal(value: number, optimal: number): number {
  if (optimal <= 0) return 0;
  if (value >= optimal) return 90;
  return (value / optimal) * 90;
}

interface PublisherAgg {
  revenue: number;
  impressions: number;
  bidRequests: number;
  bids: number;
  wins: number;
  timeouts: number;
}

function aggregateByPublisher(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[]
): Map<string, PublisherAgg> {
  const map = new Map<string, PublisherAgg>();
  for (const r of rows) {
    const pub = r.publisher || 'Unknown';
    const existing = map.get(pub) || {
      revenue: 0,
      impressions: 0,
      bidRequests: 0,
      bids: 0,
      wins: 0,
      timeouts: 0,
    };
    existing.revenue += Number(r.demand_payout || 0);
    existing.impressions += Number(r.impressions || 0);
    existing.bidRequests += Number(r.bid_requests || 0);
    existing.bids += Number(r.bids || 0);
    existing.wins += Number(r.wins || 0);
    existing.timeouts += Number(r.bid_response_timeouts || 0);
    map.set(pub, existing);
  }
  return map;
}

function computeQualityScore(agg: PublisherAgg): number {
  const bidRate = agg.bidRequests > 0 ? (agg.bids / agg.bidRequests) * 100 : 0;
  const winRate = agg.bids > 0 ? (agg.wins / agg.bids) * 100 : 0;
  const fillRate = agg.bidRequests > 0 ? (agg.impressions / agg.bidRequests) * 100 : 0;
  const successRate = agg.wins > 0 ? (agg.impressions / agg.wins) * 100 : 0;

  const bidScore = normalizeToOptimal(bidRate, 80) * 0.25;
  const winScore = normalizeToOptimal(winRate, 30) * 0.25;
  const fillScore = normalizeToOptimal(fillRate, 70) * 0.20;
  const successScore = normalizeToOptimal(successRate, 100) * 0.30;

  return Math.min(100, bidScore + winScore + fillScore + successScore);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodDays = Number(searchParams.get('period') || '7');

    const { today } = getDateRanges();

    // Current period
    const currentStart = new Date();
    currentStart.setDate(currentStart.getDate() - periodDays);
    const currentStartStr = currentStart.toISOString().split('T')[0];

    // Previous period (same length, immediately before current)
    const prevEnd = new Date(currentStart);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - periodDays + 1);
    const prevStartStr = prevStart.toISOString().split('T')[0];
    const prevEndStr = prevEnd.toISOString().split('T')[0];

    // Fetch current and previous period data
    const [currentRows, prevRows] = await Promise.all([
      fetchAllRows('limelight_stats', SELECT_COLS, {
        gte: ['date', currentStartStr],
        lte: ['date', today],
      }),
      fetchAllRows('limelight_stats', SELECT_COLS, {
        gte: ['date', prevStartStr],
        lte: ['date', prevEndStr],
      }),
    ]);

    const currentMap = aggregateByPublisher(currentRows);
    const prevMap = aggregateByPublisher(prevRows);

    // Build publisher quality results
    const publishers = Array.from(currentMap.entries()).map(([name, agg]) => {
      const bidRate = agg.bidRequests > 0 ? (agg.bids / agg.bidRequests) * 100 : 0;
      const winRate = agg.bids > 0 ? (agg.wins / agg.bids) * 100 : 0;
      const fillRate = agg.bidRequests > 0 ? (agg.impressions / agg.bidRequests) * 100 : 0;
      const qualityScore = computeQualityScore(agg);

      // Determine trend vs previous period
      const prevAgg = prevMap.get(name);
      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (prevAgg) {
        const prevScore = computeQualityScore(prevAgg);
        const diff = qualityScore - prevScore;
        if (diff > 3) trend = 'improving';
        else if (diff < -3) trend = 'declining';
      }

      return {
        publisher: name,
        qualityScore: Math.round(qualityScore * 10) / 10,
        bidRate: Math.round(bidRate * 100) / 100,
        winRate: Math.round(winRate * 100) / 100,
        fillRate: Math.round(fillRate * 100) / 100,
        revenue: agg.revenue,
        impressions: agg.impressions,
        bidRequests: agg.bidRequests,
        timeouts: agg.timeouts,
        trend,
      };
    });

    // Sort by quality score descending
    publishers.sort((a, b) => b.qualityScore - a.qualityScore);

    // Summary stats
    const totalPublishers = publishers.length;
    const avgQualityScore =
      totalPublishers > 0
        ? Math.round(
            (publishers.reduce((s, p) => s + p.qualityScore, 0) / totalPublishers) * 10
          ) / 10
        : 0;
    const highQuality = publishers.filter((p) => p.qualityScore > 70).length;
    const lowQuality = publishers.filter((p) => p.qualityScore < 40).length;

    return NextResponse.json({
      summary: {
        avgQualityScore,
        totalPublishers,
        highQuality,
        lowQuality,
      },
      publishers,
    });
  } catch (error) {
    console.error('Supply Quality API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
