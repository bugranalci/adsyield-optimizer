import { fetchAllRows, getDateRanges } from '@/lib/supabase/helpers';
import { NextRequest, NextResponse } from 'next/server';

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
      'date,demand_partner_name,bid_requests,bid_response_timeouts,bid_response_errors,impressions,demand_payout',
      {
        gte: ['date', startDate],
        lte: ['date', today],
      }
    );

    // Calculate global average eCPM for revenue loss estimation
    const totalImpressions = rows.reduce((sum, r) => sum + Number(r.impressions || 0), 0);
    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.demand_payout || 0), 0);
    const averageEcpm = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;

    // Group by demand partner
    const partnerMap = new Map<
      string,
      {
        totalRequests: number;
        timeouts: number;
        errors: number;
        impressions: number;
        revenue: number;
      }
    >();

    for (const row of rows) {
      const name = row.demand_partner_name || 'Unknown';
      if (!name || name === '') continue;

      const existing = partnerMap.get(name) || {
        totalRequests: 0,
        timeouts: 0,
        errors: 0,
        impressions: 0,
        revenue: 0,
      };

      existing.totalRequests += Number(row.bid_requests || 0);
      existing.timeouts += Number(row.bid_response_timeouts || 0);
      existing.errors += Number(row.bid_response_errors || 0);
      existing.impressions += Number(row.impressions || 0);
      existing.revenue += Number(row.demand_payout || 0);

      partnerMap.set(name, existing);
    }

    // Build partner array, only include partners with bid_requests > 0
    const partners = Array.from(partnerMap.entries())
      .filter(([, stats]) => stats.totalRequests > 0)
      .map(([name, stats]) => ({
        name,
        totalRequests: stats.totalRequests,
        timeouts: stats.timeouts,
        errors: stats.errors,
        timeoutRate: stats.totalRequests > 0 ? (stats.timeouts / stats.totalRequests) * 100 : 0,
        errorRate: stats.totalRequests > 0 ? (stats.errors / stats.totalRequests) * 100 : 0,
        estimatedRevenueLoss: (stats.timeouts * averageEcpm) / 1000,
        impressions: stats.impressions,
        revenue: stats.revenue,
      }))
      .sort((a, b) => b.timeoutRate - a.timeoutRate);

    // Build daily timeout trend
    const dailyMap = new Map<
      string,
      { totalTimeouts: number; totalRequests: number; totalErrors: number }
    >();

    for (const row of rows) {
      const date = row.date;
      const existing = dailyMap.get(date) || {
        totalTimeouts: 0,
        totalRequests: 0,
        totalErrors: 0,
      };

      existing.totalTimeouts += Number(row.bid_response_timeouts || 0);
      existing.totalRequests += Number(row.bid_requests || 0);
      existing.totalErrors += Number(row.bid_response_errors || 0);

      dailyMap.set(date, existing);
    }

    const dailyTrend = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({
        date,
        totalTimeouts: stats.totalTimeouts,
        totalRequests: stats.totalRequests,
        totalErrors: stats.totalErrors,
        timeoutRate:
          stats.totalRequests > 0
            ? (stats.totalTimeouts / stats.totalRequests) * 100
            : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Summary totals
    const summaryTotalRequests = partners.reduce((sum, p) => sum + p.totalRequests, 0);
    const summaryTotalTimeouts = partners.reduce((sum, p) => sum + p.timeouts, 0);
    const summaryTotalErrors = partners.reduce((sum, p) => sum + p.errors, 0);
    const summaryAvgTimeoutRate =
      summaryTotalRequests > 0
        ? (summaryTotalTimeouts / summaryTotalRequests) * 100
        : 0;
    const summaryEstRevenueLoss = (summaryTotalTimeouts * averageEcpm) / 1000;

    return NextResponse.json({
      summary: {
        totalTimeouts: summaryTotalTimeouts,
        avgTimeoutRate: summaryAvgTimeoutRate,
        estimatedRevenueLoss: summaryEstRevenueLoss,
        totalErrors: summaryTotalErrors,
        totalRequests: summaryTotalRequests,
      },
      partners,
      dailyTrend,
      period: selectedPeriod,
    });
  } catch (error) {
    console.error('Timeout stats API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
