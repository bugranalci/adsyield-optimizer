import { fetchAllRows, getDateRanges } from '@/lib/supabase/helpers';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

interface GeneratedAlert {
  type: 'performance' | 'revenue' | 'technical' | 'quality';
  severity: 'critical' | 'warning' | 'info';
  metric: string;
  partner: string;
  currentValue: number;
  previousValue: number;
  changePct: number;
  message: string;
}

interface PartnerMetrics {
  revenue: number;
  impressions: number;
  bidRequests: number;
  bids: number;
  wins: number;
  timeouts: number;
}

function aggregateByPartner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[]
): Map<string, PartnerMetrics> {
  const map = new Map<string, PartnerMetrics>();

  for (const row of rows) {
    const partner = row.demand_partner_name || 'Unknown';
    if (!partner || partner === '') continue;

    const existing = map.get(partner) || {
      revenue: 0,
      impressions: 0,
      bidRequests: 0,
      bids: 0,
      wins: 0,
      timeouts: 0,
    };

    existing.revenue += Number(row.demand_payout || 0);
    existing.impressions += Number(row.impressions || 0);
    existing.bidRequests += Number(row.bid_requests || 0);
    existing.bids += Number(row.bids || 0);
    existing.wins += Number(row.wins || 0);
    existing.timeouts += Number(row.bid_response_timeouts || 0);

    map.set(partner, existing);
  }

  return map;
}

function calcChangePct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export async function GET() {
  try {
    const { today, last7Start, last14Start } = getDateRanges();

    // Fetch last 7 days (current period)
    const currentRows = await fetchAllRows(
      'limelight_stats',
      'demand_partner_name,impressions,demand_payout,bid_requests,bids,wins,bid_response_timeouts',
      {
        gte: ['date', last7Start],
        lte: ['date', today],
      }
    );

    // Fetch previous 7 days (comparison period: day -14 to day -7)
    const previousRows = await fetchAllRows(
      'limelight_stats',
      'demand_partner_name,impressions,demand_payout,bid_requests,bids,wins,bid_response_timeouts',
      {
        gte: ['date', last14Start],
        lte: ['date', last7Start],
      }
    );

    const currentByPartner = aggregateByPartner(currentRows);
    const previousByPartner = aggregateByPartner(previousRows);

    const alerts: GeneratedAlert[] = [];

    // Compare each partner's metrics between periods
    const allPartners = new Set([
      ...currentByPartner.keys(),
      ...previousByPartner.keys(),
    ]);

    for (const partner of allPartners) {
      const current = currentByPartner.get(partner);
      const previous = previousByPartner.get(partner);

      // Skip partners with no data in either period
      if (!current && !previous) continue;

      const curr = current || { revenue: 0, impressions: 0, bidRequests: 0, bids: 0, wins: 0, timeouts: 0 };
      const prev = previous || { revenue: 0, impressions: 0, bidRequests: 0, bids: 0, wins: 0, timeouts: 0 };

      // --- Revenue drop checks ---
      if (prev.revenue > 0) {
        const revenueChange = calcChangePct(curr.revenue, prev.revenue);

        if (revenueChange < -15) {
          alerts.push({
            type: 'revenue',
            severity: 'critical',
            metric: 'revenue',
            partner,
            currentValue: Math.round(curr.revenue * 100) / 100,
            previousValue: Math.round(prev.revenue * 100) / 100,
            changePct: Math.round(revenueChange * 100) / 100,
            message: `Revenue from ${partner} dropped ${Math.abs(Math.round(revenueChange))}% ($${Math.round(prev.revenue)} -> $${Math.round(curr.revenue)})`,
          });
        } else if (revenueChange < -8) {
          alerts.push({
            type: 'revenue',
            severity: 'warning',
            metric: 'revenue',
            partner,
            currentValue: Math.round(curr.revenue * 100) / 100,
            previousValue: Math.round(prev.revenue * 100) / 100,
            changePct: Math.round(revenueChange * 100) / 100,
            message: `Revenue from ${partner} declined ${Math.abs(Math.round(revenueChange))}% ($${Math.round(prev.revenue)} -> $${Math.round(curr.revenue)})`,
          });
        }
      }

      // --- Timeout rate increase check ---
      const currTimeoutRate = curr.bidRequests > 0 ? (curr.timeouts / curr.bidRequests) * 100 : 0;
      const prevTimeoutRate = prev.bidRequests > 0 ? (prev.timeouts / prev.bidRequests) * 100 : 0;

      if (prev.bidRequests > 0 && prevTimeoutRate > 0) {
        const timeoutChange = calcChangePct(currTimeoutRate, prevTimeoutRate);
        if (timeoutChange > 20) {
          alerts.push({
            type: 'technical',
            severity: 'warning',
            metric: 'timeout_rate',
            partner,
            currentValue: Math.round(currTimeoutRate * 100) / 100,
            previousValue: Math.round(prevTimeoutRate * 100) / 100,
            changePct: Math.round(timeoutChange * 100) / 100,
            message: `Timeout rate for ${partner} increased ${Math.round(timeoutChange)}% (${prevTimeoutRate.toFixed(1)}% -> ${currTimeoutRate.toFixed(1)}%)`,
          });
        }
      }

      // --- Fill rate drop check ---
      const currFillRate = curr.bidRequests > 0 ? (curr.impressions / curr.bidRequests) * 100 : 0;
      const prevFillRate = prev.bidRequests > 0 ? (prev.impressions / prev.bidRequests) * 100 : 0;

      if (prev.bidRequests > 0 && prevFillRate > 0) {
        const fillRateChange = calcChangePct(currFillRate, prevFillRate);
        if (fillRateChange < -10) {
          alerts.push({
            type: 'performance',
            severity: 'warning',
            metric: 'fill_rate',
            partner,
            currentValue: Math.round(currFillRate * 100) / 100,
            previousValue: Math.round(prevFillRate * 100) / 100,
            changePct: Math.round(fillRateChange * 100) / 100,
            message: `Fill rate for ${partner} dropped ${Math.abs(Math.round(fillRateChange))}% (${prevFillRate.toFixed(1)}% -> ${currFillRate.toFixed(1)}%)`,
          });
        }
      }

      // --- eCPM drop check ---
      const currECPM = curr.impressions > 0 ? (curr.revenue / curr.impressions) * 1000 : 0;
      const prevECPM = prev.impressions > 0 ? (prev.revenue / prev.impressions) * 1000 : 0;

      if (prev.impressions > 0 && prevECPM > 0) {
        const ecpmChange = calcChangePct(currECPM, prevECPM);
        if (ecpmChange < -15) {
          alerts.push({
            type: 'performance',
            severity: 'warning',
            metric: 'ecpm',
            partner,
            currentValue: Math.round(currECPM * 100) / 100,
            previousValue: Math.round(prevECPM * 100) / 100,
            changePct: Math.round(ecpmChange * 100) / 100,
            message: `eCPM for ${partner} dropped ${Math.abs(Math.round(ecpmChange))}% ($${prevECPM.toFixed(2)} -> $${currECPM.toFixed(2)})`,
          });
        }
      }
    }

    // Sort alerts: critical first, then warning, then info
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Store alerts in the alerts table via service client
    const supabase = createServiceClient();
    const now = new Date().toISOString();

    if (alerts.length > 0) {
      const alertRows = alerts.map((alert) => ({
        type: alert.type,
        severity: alert.severity,
        metric: alert.metric,
        threshold: 0,
        current_value: alert.currentValue,
        previous_value: alert.previousValue,
        change: alert.changePct,
        message: alert.message,
        partner: alert.partner,
        resolved: false,
        created_at: now,
      }));

      const { error: insertError } = await supabase
        .from('alerts')
        .insert(alertRows);

      if (insertError) {
        console.error('[Alerts] Failed to store alerts in DB:', insertError.message);
        // Don't fail the request -- still return the alerts
      } else {
        console.log(`[Alerts] Stored ${alertRows.length} alerts in DB`);
      }
    }

    // Summary counts
    const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
    const warningCount = alerts.filter((a) => a.severity === 'warning').length;
    const infoCount = alerts.filter((a) => a.severity === 'info').length;

    return NextResponse.json({
      generatedAt: now,
      summary: {
        total: alerts.length,
        critical: criticalCount,
        warning: warningCount,
        info: infoCount,
      },
      alerts,
    });
  } catch (error) {
    console.error('[Alerts] API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate alerts' },
      { status: 500 }
    );
  }
}
