import { fetchAllRows, getDateRanges } from '@/lib/supabase/helpers';
import { NextResponse } from 'next/server';

interface Recommendation {
  id: string;
  type: 'partner-bid-floor' | 'timeout-fix' | 'fill-rate' | 'revenue-leakage' | 'publisher-quality';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  estimatedRevenueLift: number;
  difficulty: 'easy' | 'medium' | 'hard';
  actionSteps: string[];
  partner?: string;
  publisher?: string;
  currentValue?: number;
  targetValue?: number;
}

// ============================================
// Revenue lift cap: no single recommendation
// should exceed 3x the partner's current weekly revenue,
// and absolute max is $50K per recommendation (weekly).
// ============================================
function capRevenueLift(lift: number, currentRevenue: number): number {
  const partnerCap = Math.max(currentRevenue * 3, 50); // At least $50 floor
  const absoluteCap = 50000; // $50K weekly max per recommendation
  return Math.round(Math.min(Math.max(lift, 0), partnerCap, absoluteCap) * 100) / 100;
}

export async function GET() {
  try {
    // Always analyze last 7 days
    const { today, last7Start } = getDateRanges();

    const rows = await fetchAllRows(
      'limelight_stats',
      'date,demand_partner_name,publisher,impressions,demand_payout,pub_payout,bid_requests,bids,wins,opportunities,bid_response_timeouts,bid_response_errors',
      {
        gte: ['date', last7Start],
        lte: ['date', today],
      }
    );

    const recommendations: Recommendation[] = [];
    let recIdCounter = 1;

    // ====================================================
    // Aggregate by demand partner
    // ====================================================
    const partnerMap = new Map<
      string,
      {
        revenue: number;
        impressions: number;
        bidRequests: number;
        bids: number;
        wins: number;
        opportunities: number;
        timeouts: number;
        errors: number;
      }
    >();

    for (const row of rows) {
      const partner = row.demand_partner_name || 'Unknown';
      if (!partner || partner === '') continue;

      const existing = partnerMap.get(partner) || {
        revenue: 0,
        impressions: 0,
        bidRequests: 0,
        bids: 0,
        wins: 0,
        opportunities: 0,
        timeouts: 0,
        errors: 0,
      };

      existing.revenue += Number(row.demand_payout || 0);
      existing.impressions += Number(row.impressions || 0);
      existing.bidRequests += Number(row.bid_requests || 0);
      existing.bids += Number(row.bids || 0);
      existing.wins += Number(row.wins || 0);
      existing.opportunities += Number(row.opportunities || 0);
      existing.timeouts += Number(row.bid_response_timeouts || 0);
      existing.errors += Number(row.bid_response_errors || 0);

      partnerMap.set(partner, existing);
    }

    // ====================================================
    // Aggregate by publisher
    // ====================================================
    const publisherMap = new Map<
      string,
      {
        revenue: number;
        impressions: number;
        bidRequests: number;
        bids: number;
        wins: number;
        opportunities: number;
        timeouts: number;
        errors: number;
      }
    >();

    for (const row of rows) {
      const publisher = row.publisher || 'Unknown';
      if (!publisher || publisher === '') continue;

      const existing = publisherMap.get(publisher) || {
        revenue: 0,
        impressions: 0,
        bidRequests: 0,
        bids: 0,
        wins: 0,
        opportunities: 0,
        timeouts: 0,
        errors: 0,
      };

      existing.revenue += Number(row.demand_payout || 0);
      existing.impressions += Number(row.impressions || 0);
      existing.bidRequests += Number(row.bid_requests || 0);
      existing.bids += Number(row.bids || 0);
      existing.wins += Number(row.wins || 0);
      existing.opportunities += Number(row.opportunities || 0);
      existing.timeouts += Number(row.bid_response_timeouts || 0);
      existing.errors += Number(row.bid_response_errors || 0);

      publisherMap.set(publisher, existing);
    }

    // Calculate global averages
    const totalImpressions = Array.from(partnerMap.values()).reduce((s, p) => s + p.impressions, 0);
    const totalRevenue = Array.from(partnerMap.values()).reduce((s, p) => s + p.revenue, 0);
    const globalEcpm = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;

    // Calculate average win rate across all partners (for realistic targets)
    const totalBids = Array.from(partnerMap.values()).reduce((s, p) => s + p.bids, 0);
    const totalWins = Array.from(partnerMap.values()).reduce((s, p) => s + p.wins, 0);
    const globalWinRate = totalBids > 0 ? (totalWins / totalBids) * 100 : 0;

    // Calculate average publisher fill rate
    const publisherFillRates: number[] = [];
    for (const [, stats] of publisherMap) {
      if (stats.bidRequests > 0 && stats.impressions > 0) {
        publisherFillRates.push((stats.impressions / stats.bidRequests) * 100);
      }
    }
    const avgPublisherFillRate =
      publisherFillRates.length > 0
        ? publisherFillRates.reduce((s, r) => s + r, 0) / publisherFillRates.length
        : 0;

    // ====================================================
    // Rule 1: Partner Bid Floor
    // eCPM < $1.50 AND impressions > 1000
    // Lift = conservative 30% of the gap × current impressions
    // ====================================================
    for (const [name, stats] of partnerMap) {
      if (name === 'Unknown') continue;
      if (stats.impressions <= 1000) continue;

      const ecpm = (stats.revenue / stats.impressions) * 1000;

      if (ecpm < 1.5) {
        // Raising floor won't magically increase eCPM for all impressions.
        // Realistic: some low-value impressions get filtered, remaining have higher eCPM.
        // Assume 30% of impressions survive at target eCPM.
        const survivingImpressions = stats.impressions * 0.3;
        const potentialLift = (survivingImpressions * (1.5 - ecpm)) / 1000;

        recommendations.push({
          id: `rec-${recIdCounter++}`,
          type: 'partner-bid-floor',
          priority: ecpm < 0.5 ? 'critical' : ecpm < 1.0 ? 'high' : 'medium',
          title: `Increase bid floor for ${name}`,
          description: `${name} has an eCPM of $${ecpm.toFixed(2)}, which is below the $1.50 threshold, across ${stats.impressions.toLocaleString()} impressions. Raising the bid floor could filter low-value bids, but will likely reduce volume by 50-70%. Net revenue impact depends on bid price distribution.`,
          estimatedRevenueLift: capRevenueLift(potentialLift, stats.revenue),
          difficulty: 'easy',
          actionSteps: [
            `Review current bid floor settings for ${name}`,
            `Test a $1.00 floor first (lower risk), monitor for 48h`,
            `If volume holds, increase to $1.50`,
            `Watch impression count — if it drops >70%, the floor is too aggressive`,
          ],
          partner: name,
          currentValue: ecpm,
          targetValue: 1.5,
        });
      }
    }

    // ====================================================
    // Rule 2: Timeout Fix
    // timeout_rate > 15% AND bid_requests > 10K
    // Lift = recovered timeouts × partner's own bid-to-win conversion × partner's eCPM
    // ====================================================
    for (const [name, stats] of partnerMap) {
      if (name === 'Unknown') continue;
      if (stats.bidRequests <= 10000) continue;

      const timeoutRate = (stats.timeouts / stats.bidRequests) * 100;

      if (timeoutRate > 15) {
        // Recoverable timeouts: reduce timeout rate to 10% (realistic target)
        const targetTimeoutRate = 10;
        const recoverableTimeouts = stats.timeouts - (stats.bidRequests * targetTimeoutRate / 100);
        if (recoverableTimeouts <= 0) continue;

        // These recovered timeouts become bids. Apply partner's own bid→win→impression funnel.
        const bidRate = stats.bidRequests > 0 && stats.bids > 0 ? stats.bids / stats.bidRequests : 0;
        const winRate = stats.bids > 0 && stats.wins > 0 ? stats.wins / stats.bids : 0;
        const partnerEcpm = stats.impressions > 0 ? (stats.revenue / stats.impressions) * 1000 : globalEcpm;

        // Recovered timeouts → additional bids → additional wins → additional revenue
        const additionalBids = recoverableTimeouts * Math.min(bidRate, 0.1);
        const additionalWins = additionalBids * Math.min(winRate, 0.5);
        const estimatedLift = (additionalWins * partnerEcpm) / 1000;

        recommendations.push({
          id: `rec-${recIdCounter++}`,
          type: 'timeout-fix',
          priority: timeoutRate > 30 ? 'critical' : 'high',
          title: `Investigate timeouts for ${name}`,
          description: `${name} has a timeout rate of ${timeoutRate.toFixed(1)}% across ${stats.bidRequests.toLocaleString()} bid requests (${stats.timeouts.toLocaleString()} timeouts). Reducing timeouts to ~10% could recover ${Math.round(recoverableTimeouts).toLocaleString()} bid opportunities.`,
          estimatedRevenueLift: capRevenueLift(estimatedLift, stats.revenue),
          difficulty: 'medium',
          actionSteps: [
            `Contact ${name} to report high timeout rate (${timeoutRate.toFixed(1)}%)`,
            'Check if timeout threshold is appropriate (consider 200ms for video, 150ms for display)',
            'Review server-side logs for connection errors or DNS issues',
            'Test endpoint latency from different regions',
            'Monitor timeout rate daily for the next week after changes',
          ],
          partner: name,
          currentValue: timeoutRate,
          targetValue: targetTimeoutRate,
        });
      }
    }

    // ====================================================
    // Rule 3: Fill Rate Optimization
    // fill_rate < 0.1% AND impressions >= 10 (need some data)
    // Lift = doubling current fill rate (realistic 2x, not 100x)
    // ====================================================
    for (const [name, stats] of partnerMap) {
      if (name === 'Unknown') continue;
      if (stats.bidRequests <= 0) continue;
      if (stats.impressions < 10) continue; // Need at least some impressions for meaningful eCPM

      const fillRate = (stats.impressions / stats.bidRequests) * 100;

      if (fillRate < 0.1 && stats.revenue > 10) {
        // Realistic: doubling fill rate is ambitious but achievable
        const additionalImpressions = stats.impressions; // 2x current = 1x additional
        const currentEcpm = (stats.revenue / stats.impressions) * 1000;
        const estimatedLift = (additionalImpressions * currentEcpm) / 1000;

        recommendations.push({
          id: `rec-${recIdCounter++}`,
          type: 'fill-rate',
          priority: stats.revenue > 200 ? 'high' : 'medium',
          title: `Improve fill rate for ${name}`,
          description: `${name} has a fill rate of ${fillRate.toFixed(4)}% with $${stats.revenue.toFixed(0)} revenue from ${stats.impressions.toLocaleString()} impressions. With ${stats.bidRequests.toLocaleString()} bid requests available, doubling the fill rate through optimization could add meaningful revenue.`,
          estimatedRevenueLift: capRevenueLift(estimatedLift, stats.revenue),
          difficulty: 'medium',
          actionSteps: [
            `Analyze bid request parameters being sent to ${name}`,
            'Check if ad format/size requirements match available inventory',
            'Review geographic targeting and app/site list alignment',
            'Consider enabling additional ad formats (banner, video, native)',
            'Schedule an optimization call with the partner',
          ],
          partner: name,
          currentValue: fillRate,
          targetValue: fillRate * 2,
        });
      }
    }

    // ====================================================
    // Rule 4: Revenue Leakage (Win Rate)
    // win_rate < 5% AND wins >= 5 (need statistical significance)
    // Lift = realistic improvement based on global avg win rate
    // ====================================================
    for (const [name, stats] of partnerMap) {
      if (name === 'Unknown') continue;
      if (stats.bids < 100) continue; // Need meaningful bid volume
      if (stats.wins < 5) continue;   // Need statistical significance

      const winRate = (stats.wins / stats.bids) * 100;

      if (winRate < 5) {
        // Realistic target: double current win rate OR reach half of global average, whichever is lower
        const targetWinRate = Math.min(winRate * 2, globalWinRate * 0.5, 10);
        if (targetWinRate <= winRate) continue; // No room for improvement

        const additionalWins = stats.bids * ((targetWinRate - winRate) / 100);
        const revenuePerWin = stats.revenue / stats.wins;
        const estimatedLift = additionalWins * revenuePerWin;

        recommendations.push({
          id: `rec-${recIdCounter++}`,
          type: 'revenue-leakage',
          priority: stats.revenue > 100 ? 'high' : stats.bids > 50000 ? 'high' : 'medium',
          title: `Revenue leakage detected: ${name}`,
          description: `${name} submitted ${stats.bids.toLocaleString()} bids but only won ${stats.wins.toLocaleString()} (${winRate.toFixed(2)}% win rate). The platform average win rate is ${globalWinRate.toFixed(2)}%. Improving win rate to ${targetWinRate.toFixed(2)}% through bid optimization could recover lost revenue.`,
          estimatedRevenueLift: capRevenueLift(estimatedLift, stats.revenue),
          difficulty: 'hard',
          actionSteps: [
            `Review auction dynamics and bid pricing for ${name}`,
            'Check if bid responses are arriving after auction close (latency issue)',
            'Analyze bid price distribution vs. winning bid prices',
            'Investigate creative or policy filtering that may reject wins',
            'Consider adjusting auction priority or second-price floor',
            `Discuss bid optimization strategy with ${name} account team`,
          ],
          partner: name,
          currentValue: winRate,
          targetValue: targetWinRate,
        });
      }
    }

    // ====================================================
    // Rule 5: Publisher Quality
    // fill_rate < average/2 AND bid_requests >= 5K AND impressions >= 10
    // Lift = reaching 75% of average fill rate (not full average)
    // ====================================================
    const fillRateThreshold = avgPublisherFillRate / 2;

    for (const [name, stats] of publisherMap) {
      if (name === 'Unknown') continue;
      if (stats.bidRequests < 5000) continue; // Need meaningful volume
      if (stats.impressions < 10) continue;   // Need eCPM data

      const fillRate = (stats.impressions / stats.bidRequests) * 100;

      if (fillRate < fillRateThreshold && fillRateThreshold > 0) {
        // Realistic target: reach 75% of average (not 100%)
        const targetFillRate = avgPublisherFillRate * 0.75;
        const additionalImpressions = stats.bidRequests * ((targetFillRate - fillRate) / 100);
        const pubEcpm = (stats.revenue / stats.impressions) * 1000;
        const estimatedLift = (additionalImpressions * pubEcpm) / 1000;

        recommendations.push({
          id: `rec-${recIdCounter++}`,
          type: 'publisher-quality',
          priority: stats.revenue > 100 ? 'high' : 'medium',
          title: `Low fill rate for publisher: ${name}`,
          description: `Publisher "${name}" has a fill rate of ${fillRate.toFixed(3)}%, well below the average of ${avgPublisherFillRate.toFixed(3)}%. With ${stats.bidRequests.toLocaleString()} bid requests, improving demand partner coverage could unlock additional revenue.`,
          estimatedRevenueLift: capRevenueLift(estimatedLift, stats.revenue),
          difficulty: 'medium',
          actionSteps: [
            `Review ad placement quality for publisher "${name}"`,
            'Check if the publisher has proper app-ads.txt entries',
            'Analyze which demand partners are not bidding on this publisher',
            'Verify ad format and size configurations match demand requirements',
            'Consider adding more demand partners to increase competition',
          ],
          publisher: name,
          currentValue: fillRate,
          targetValue: targetFillRate,
        });
      }
    }

    // ====================================================
    // Sort by estimated revenue lift (descending)
    // ====================================================
    recommendations.sort((a, b) => b.estimatedRevenueLift - a.estimatedRevenueLift);

    // Summary
    const criticalCount = recommendations.filter((r) => r.priority === 'critical').length;
    const highCount = recommendations.filter((r) => r.priority === 'high').length;
    const mediumCount = recommendations.filter((r) => r.priority === 'medium').length;
    const lowCount = recommendations.filter((r) => r.priority === 'low').length;
    const totalEstimatedLift = recommendations.reduce((s, r) => s + r.estimatedRevenueLift, 0);

    return NextResponse.json({
      summary: {
        totalRecommendations: recommendations.length,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        estimatedTotalRevenueLift: Math.round(totalEstimatedLift * 100) / 100,
      },
      recommendations,
    });
  } catch (error) {
    console.error('Recommendations API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
