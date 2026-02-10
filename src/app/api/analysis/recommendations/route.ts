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

    // Calculate global averages for thresholds
    const totalImpressions = Array.from(partnerMap.values()).reduce((s, p) => s + p.impressions, 0);
    const totalRevenue = Array.from(partnerMap.values()).reduce((s, p) => s + p.revenue, 0);
    const globalEcpm = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;

    // Calculate average publisher fill rate for rule 5
    const publisherFillRates: number[] = [];
    for (const [, stats] of publisherMap) {
      if (stats.bidRequests > 0) {
        publisherFillRates.push((stats.impressions / stats.bidRequests) * 100);
      }
    }
    const avgPublisherFillRate =
      publisherFillRates.length > 0
        ? publisherFillRates.reduce((s, r) => s + r, 0) / publisherFillRates.length
        : 0;

    // ====================================================
    // Rule 1: Partner Bid Floor
    // If partner eCPM < $1.5 AND impressions > 1000 -> recommend bid floor increase
    // ====================================================
    for (const [name, stats] of partnerMap) {
      if (name === 'Unknown') continue;
      const ecpm = stats.impressions > 0 ? (stats.revenue / stats.impressions) * 1000 : 0;

      if (ecpm < 1.5 && stats.impressions > 1000) {
        const potentialLift = stats.impressions > 0
          ? ((1.5 - ecpm) / 1000) * stats.impressions * 0.3 // Conservative 30% of gap
          : 0;

        recommendations.push({
          id: `rec-${recIdCounter++}`,
          type: 'partner-bid-floor',
          priority: ecpm < 0.5 ? 'critical' : ecpm < 1.0 ? 'high' : 'medium',
          title: `Increase bid floor for ${name}`,
          description: `${name} has an eCPM of $${ecpm.toFixed(2)}, which is below the $1.50 threshold, across ${stats.impressions.toLocaleString()} impressions. Raising the bid floor could improve yield by filtering low-value bids and encouraging higher bids from this partner.`,
          estimatedRevenueLift: Math.round(potentialLift * 100) / 100,
          difficulty: 'easy',
          actionSteps: [
            `Review current bid floor settings for ${name}`,
            `Set minimum bid floor to $1.50 CPM`,
            `Monitor impressions and revenue for 48 hours after change`,
            `If impressions drop more than 20%, consider lowering floor to $1.00`,
          ],
          partner: name,
          currentValue: ecpm,
          targetValue: 1.5,
        });
      }
    }

    // ====================================================
    // Rule 2: Timeout Fix
    // If partner timeout rate > 15% AND bid_requests > 10000 -> recommend timeout investigation
    // ====================================================
    for (const [name, stats] of partnerMap) {
      if (name === 'Unknown') continue;
      const timeoutRate = stats.bidRequests > 0 ? (stats.timeouts / stats.bidRequests) * 100 : 0;

      if (timeoutRate > 15 && stats.bidRequests > 10000) {
        const lostBids = stats.timeouts;
        // Estimate revenue from lost bids using global eCPM and average win rate
        const avgWinRate = stats.bids > 0 ? stats.wins / stats.bids : 0.1;
        const estimatedLostImpressions = lostBids * avgWinRate;
        const estimatedLift = (estimatedLostImpressions * globalEcpm) / 1000;

        recommendations.push({
          id: `rec-${recIdCounter++}`,
          type: 'timeout-fix',
          priority: timeoutRate > 30 ? 'critical' : 'high',
          title: `Investigate timeouts for ${name}`,
          description: `${name} has a timeout rate of ${timeoutRate.toFixed(1)}% across ${stats.bidRequests.toLocaleString()} bid requests (${stats.timeouts.toLocaleString()} timeouts). This is significantly above the 15% threshold and indicates potential infrastructure or configuration issues.`,
          estimatedRevenueLift: Math.round(estimatedLift * 100) / 100,
          difficulty: 'medium',
          actionSteps: [
            `Contact ${name} to report high timeout rate (${timeoutRate.toFixed(1)}%)`,
            'Check if timeout threshold setting is appropriate (consider increasing from 150ms to 200ms)',
            'Review server-side logs for connection errors or slow responses',
            'Test endpoint latency from different regions',
            'Monitor timeout rate daily for the next week',
          ],
          partner: name,
          currentValue: timeoutRate,
          targetValue: 10,
        });
      }
    }

    // ====================================================
    // Rule 3: Fill Rate Optimization
    // If fill rate < 0.1% AND revenue > $50 -> recommend fill rate improvement
    // ====================================================
    for (const [name, stats] of partnerMap) {
      if (name === 'Unknown') continue;
      const fillRate = stats.bidRequests > 0 ? (stats.impressions / stats.bidRequests) * 100 : 0;

      if (fillRate < 0.1 && stats.revenue > 50) {
        // Estimate what 1% fill rate could yield
        const potentialImpressions = stats.bidRequests * 0.01;
        const currentEcpm = stats.impressions > 0 ? (stats.revenue / stats.impressions) * 1000 : globalEcpm;
        const estimatedLift = ((potentialImpressions - stats.impressions) * currentEcpm) / 1000;

        recommendations.push({
          id: `rec-${recIdCounter++}`,
          type: 'fill-rate',
          priority: stats.revenue > 200 ? 'high' : 'medium',
          title: `Improve fill rate for ${name}`,
          description: `${name} has a fill rate of just ${fillRate.toFixed(3)}% despite generating $${stats.revenue.toFixed(0)} in revenue. With ${stats.bidRequests.toLocaleString()} bid requests, even a small fill rate improvement could significantly boost revenue.`,
          estimatedRevenueLift: Math.round(Math.max(estimatedLift, 0) * 100) / 100,
          difficulty: 'medium',
          actionSteps: [
            `Analyze bid request parameters being sent to ${name}`,
            'Check if ad format or size requirements are mismatched',
            'Review geographic targeting and ensure correct setup',
            'Consider enabling additional ad formats or inventory types',
            'Schedule a call with the partner to discuss optimization',
          ],
          partner: name,
          currentValue: fillRate,
          targetValue: 1.0,
        });
      }
    }

    // ====================================================
    // Rule 4: Revenue Leakage
    // If partner has high bids but low wins (win rate < 5%) -> recommend investigation
    // ====================================================
    for (const [name, stats] of partnerMap) {
      if (name === 'Unknown') continue;
      if (stats.bids < 100) continue; // Need meaningful bid volume
      const winRate = stats.bids > 0 ? (stats.wins / stats.bids) * 100 : 0;

      if (winRate < 5) {
        // Estimate lost revenue: if win rate were 20%, how much more revenue
        const currentRevPerWin = stats.wins > 0 ? stats.revenue / stats.wins : (stats.revenue > 0 ? stats.revenue : 0.01);
        const potentialWins = stats.bids * 0.15; // conservative 15% target
        const estimatedLift = (potentialWins - stats.wins) * currentRevPerWin;

        recommendations.push({
          id: `rec-${recIdCounter++}`,
          type: 'revenue-leakage',
          priority: stats.bids > 50000 ? 'critical' : stats.bids > 10000 ? 'high' : 'medium',
          title: `Revenue leakage detected: ${name}`,
          description: `${name} submitted ${stats.bids.toLocaleString()} bids but only won ${stats.wins.toLocaleString()} (${winRate.toFixed(1)}% win rate). This suggests the partner is being outbid consistently, or there are technical issues preventing wins from converting.`,
          estimatedRevenueLift: Math.round(Math.max(estimatedLift, 0) * 100) / 100,
          difficulty: 'hard',
          actionSteps: [
            `Review auction dynamics and pricing for ${name}`,
            'Check if bid responses are arriving after auction close',
            'Analyze bid price distribution compared to winning bids',
            'Investigate creative or policy filtering that may reject wins',
            'Consider adjusting auction priority or timeout settings',
            `Discuss bid optimization strategy with ${name} account team`,
          ],
          partner: name,
          currentValue: winRate,
          targetValue: 15,
        });
      }
    }

    // ====================================================
    // Rule 5: Publisher Quality
    // If publisher fill rate < average/2 -> recommend quality review
    // ====================================================
    const fillRateThreshold = avgPublisherFillRate / 2;

    for (const [name, stats] of publisherMap) {
      if (name === 'Unknown') continue;
      if (stats.bidRequests < 1000) continue; // Need meaningful volume
      const fillRate = stats.bidRequests > 0 ? (stats.impressions / stats.bidRequests) * 100 : 0;

      if (fillRate < fillRateThreshold) {
        // Estimate lift if we bring fill rate to average
        const potentialImpressions = stats.bidRequests * (avgPublisherFillRate / 100);
        const pubEcpm = stats.impressions > 0 ? (stats.revenue / stats.impressions) * 1000 : globalEcpm;
        const estimatedLift = ((potentialImpressions - stats.impressions) * pubEcpm) / 1000;

        recommendations.push({
          id: `rec-${recIdCounter++}`,
          type: 'publisher-quality',
          priority: stats.revenue > 100 ? 'high' : fillRate < fillRateThreshold / 2 ? 'medium' : 'low',
          title: `Low fill rate for publisher: ${name}`,
          description: `Publisher "${name}" has a fill rate of ${fillRate.toFixed(2)}%, which is less than half the average publisher fill rate of ${avgPublisherFillRate.toFixed(2)}%. With ${stats.bidRequests.toLocaleString()} bid requests, there is significant untapped revenue potential.`,
          estimatedRevenueLift: Math.round(Math.max(estimatedLift, 0) * 100) / 100,
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
          targetValue: avgPublisherFillRate,
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
