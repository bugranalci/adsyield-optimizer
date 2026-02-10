import { createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import type { IVTReportData } from '@/types';

// GIVT (General Invalid Traffic) rule IDs (must match ruleId in rules.ts)
const GIVT_RULES = [
  'invalid_ifa',
  'datacenter_ip',
  'bot_user_agent',
  'invalid_bundle',
];

// SIVT (Sophisticated Invalid Traffic) rule IDs (lowercase to match DB values)
const SIVT_RULES = [
  'high_freq_ifa',
  'high_freq_ip',
  'device_os_mismatch',
];

// Strip /32 suffix from INET type
function cleanIP(ip: string): string {
  return ip ? ip.replace(/\/\d+$/, '') : ip;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get('period') || '7', 10);

    // Validate period
    if (![7, 14, 30].includes(period)) {
      return NextResponse.json(
        { error: 'Invalid period. Must be 7, 14, or 30.' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Calculate date range
    const now = new Date();
    const endDate = now.toISOString();
    const startDateObj = new Date(now);
    startDateObj.setDate(startDateObj.getDate() - period);
    const startDate = startDateObj.toISOString();

    // ---- Summary counts ----

    // Total impressions in period
    const { count: totalImpressions } = await supabase
      .from('ivt_impressions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate)
      .lt('created_at', endDate);

    // Suspicious count
    const { count: suspiciousImpressions } = await supabase
      .from('ivt_impressions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .eq('is_suspicious', true);

    // Analyzed count
    const { count: analyzedCount } = await supabase
      .from('ivt_impressions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .not('analyzed_at', 'is', null);

    const total = totalImpressions ?? 0;
    const suspicious = suspiciousImpressions ?? 0;
    const analyzed = analyzedCount ?? 0;
    const unanalyzed = total - analyzed;
    const suspiciousRate = total > 0 ? (suspicious / total) * 100 : 0;

    // ---- GIVT / SIVT counts via RPC reason breakdown ----
    let givtCount = 0;
    let sivtCount = 0;

    try {
      const { data: reasonCounts, error: reasonError } = await supabase.rpc(
        'get_ivt_reason_counts',
        { start_ts: startDate, end_ts: endDate }
      );

      if (reasonError) throw reasonError;

      if (reasonCounts && Array.isArray(reasonCounts)) {
        for (const row of reasonCounts) {
          const reason = (row.reason as string) || '';
          const cnt = Number(row.cnt) || 0;
          if (GIVT_RULES.includes(reason)) {
            givtCount += cnt;
          } else if (SIVT_RULES.includes(reason)) {
            sivtCount += cnt;
          }
        }
      }
    } catch {
      // RPC not available -- fall back to 60/40 estimate
      givtCount = Math.round(suspicious * 0.6);
      sivtCount = Math.round(suspicious * 0.4);
    }

    // ---- Top reasons via RPC (with fallback) ----
    let topReasons: Array<{ reason: string; count: number }> = [];

    try {
      const { data: reasonData, error: reasonErr } = await supabase.rpc(
        'get_ivt_reason_counts',
        { start_ts: startDate, end_ts: endDate }
      );

      if (reasonErr) throw reasonErr;

      if (reasonData && Array.isArray(reasonData)) {
        topReasons = reasonData.map((r: { reason: string; cnt: number }) => ({
          reason: r.reason,
          count: Number(r.cnt),
        }));
        topReasons.sort((a, b) => b.count - a.count);
      }
    } catch {
      topReasons = [];
    }

    // ---- Daily trend via RPC (with fallback) ----
    let dailyTrend: Array<{ date: string; total: number; suspicious: number; rate: number }> = [];

    try {
      const { data: trendData, error: trendErr } = await supabase.rpc(
        'get_ivt_daily_trend',
        { start_ts: startDate, end_ts: endDate }
      );

      if (trendErr) throw trendErr;

      if (trendData && Array.isArray(trendData)) {
        dailyTrend = trendData.map((d: { day: string; total: number; suspicious: number }) => ({
          date: d.day,
          total: Number(d.total),
          suspicious: Number(d.suspicious),
          rate: Number(d.total) > 0
            ? (Number(d.suspicious) / Number(d.total)) * 100
            : 0,
        }));
      }
    } catch {
      dailyTrend = [];
    }

    // ---- Top suspicious IPs via RPC (with fallback) ----
    let topSuspiciousIPs: Array<{ ip: string; count: number; uniqueBundles: number }> = [];

    try {
      const { data: ipData, error: ipErr } = await supabase.rpc(
        'get_ivt_top_ips',
        { start_ts: startDate, end_ts: endDate }
      );

      if (ipErr) throw ipErr;

      if (ipData && Array.isArray(ipData)) {
        topSuspiciousIPs = ipData.map((r: { ip: string; cnt: number; unique_bundles: number }) => ({
          ip: cleanIP(r.ip),
          count: Number(r.cnt),
          uniqueBundles: Number(r.unique_bundles),
        }));
      }
    } catch {
      topSuspiciousIPs = [];
    }

    // ---- Top suspicious bundles via RPC (with fallback) ----
    let topSuspiciousBundles: Array<{ bundle: string; count: number; suspiciousRate: number }> = [];

    try {
      const { data: bundleData, error: bundleErr } = await supabase.rpc(
        'get_ivt_top_bundles',
        { start_ts: startDate, end_ts: endDate }
      );

      if (bundleErr) throw bundleErr;

      if (bundleData && Array.isArray(bundleData)) {
        topSuspiciousBundles = bundleData.map(
          (r: { bundle: string; suspicious_count: number; suspicious_rate: number }) => ({
            bundle: r.bundle,
            count: Number(r.suspicious_count),
            suspiciousRate: Number(r.suspicious_rate),
          })
        );
      }
    } catch {
      topSuspiciousBundles = [];
    }

    // ---- Build response ----
    const report: IVTReportData = {
      summary: {
        totalImpressions: total,
        suspiciousImpressions: suspicious,
        suspiciousRate: Math.round(suspiciousRate * 10) / 10,
        givtCount,
        sivtCount,
        analyzedCount: analyzed,
        unanalyzedCount: unanalyzed,
      },
      topReasons,
      topSuspiciousIPs,
      topSuspiciousBundles,
      dailyTrend,
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error('[IVT Report] API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate IVT report' },
      { status: 500 }
    );
  }
}
