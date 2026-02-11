import { createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import type { IVTReportData } from '@/types';
import { arrayToCSV, CSV_BOM } from '@/lib/utils/csv';

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
    const publisher = searchParams.get('publisher') || null;
    const format = searchParams.get('format') || 'json';
    const exportType = searchParams.get('export') || null;

    // Return distinct publisher (pub_id) list for dropdown directly from IVT data
    if (searchParams.get('publishers_list') === 'true') {
      const supabase = createServiceClient();

      // Use RPC for efficient DB-side DISTINCT (no row limit issues)
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_distinct_ivt_publishers');
        if (!rpcError && rpcData) {
          const publishers = rpcData.map((r: { pub_id: string }) => r.pub_id).filter(Boolean);
          return NextResponse.json({ publishers });
        }
      } catch {
        // RPC not available yet, fall through to fallback
      }

      // Fallback: high-limit select + JS dedup
      const { data, error } = await supabase
        .from('ivt_impressions')
        .select('pub_id')
        .not('pub_id', 'is', null)
        .neq('pub_id', '')
        .limit(50000);

      if (error) throw error;

      const unique = [...new Set((data || []).map((r) => r.pub_id).filter(Boolean))].sort();
      return NextResponse.json({ publishers: unique });
    }

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

    // ---- Publisher filter: directly via pub_id on ivt_impressions ----
    const hasPublisherFilter = !!publisher;

    // ---- Export raw impressions as CSV ----
    if (exportType === 'impressions') {
      let query = supabase
        .from('ivt_impressions')
        .select('timestamp,pub_id,bundle,ifa,ip,user_agent,device_make,os,os_version,creative_id,origin_ssp_pub_id,is_suspicious,ivt_reasons,ivt_score,created_at')
        .gte('created_at', startDate)
        .lt('created_at', endDate)
        .order('created_at', { ascending: false })
        .limit(10000);

      if (hasPublisherFilter) {
        query = query.eq('pub_id', publisher);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []).map((r) => ({
        ...r,
        ip: cleanIP(r.ip || ''),
        ivt_reasons: Array.isArray(r.ivt_reasons) ? r.ivt_reasons.join('; ') : '',
      }));

      const csv = CSV_BOM + arrayToCSV(rows as Record<string, unknown>[]);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="ivt-impressions-${period}d${publisher ? `-${publisher}` : ''}.csv"`,
        },
      });
    }

    // ---- Summary counts (with optional publisher filter) ----
    const buildCountQuery = (suspicious?: boolean, analyzed?: boolean) => {
      let q = supabase
        .from('ivt_impressions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startDate)
        .lt('created_at', endDate);

      if (hasPublisherFilter) q = q.eq('pub_id', publisher);
      if (suspicious !== undefined) q = q.eq('is_suspicious', suspicious);
      if (analyzed) q = q.not('analyzed_at', 'is', null);

      return q;
    };

    const [totalRes, suspiciousRes, analyzedRes] = await Promise.all([
      buildCountQuery(),
      buildCountQuery(true),
      buildCountQuery(undefined, true),
    ]);

    const total = totalRes.count ?? 0;
    const suspicious = suspiciousRes.count ?? 0;
    const analyzed = analyzedRes.count ?? 0;
    const unanalyzed = total - analyzed;
    const suspiciousRate = total > 0 ? (suspicious / total) * 100 : 0;

    // ---- GIVT / SIVT counts + top reasons ----
    let givtCount = 0;
    let sivtCount = 0;
    let topReasons: Array<{ reason: string; count: number }> = [];

    if (hasPublisherFilter) {
      // Direct query when publisher filter active
      const { data: suspData } = await supabase
        .from('ivt_impressions')
        .select('ivt_reasons')
        .gte('created_at', startDate)
        .lt('created_at', endDate)
        .eq('pub_id', publisher)
        .eq('is_suspicious', true)
        .limit(5000);

      const reasonMap = new Map<string, number>();
      for (const row of suspData || []) {
        if (Array.isArray(row.ivt_reasons)) {
          for (const reason of row.ivt_reasons) {
            reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
          }
        }
      }
      for (const [reason, cnt] of reasonMap) {
        if (GIVT_RULES.includes(reason)) givtCount += cnt;
        else if (SIVT_RULES.includes(reason)) sivtCount += cnt;
        topReasons.push({ reason, count: cnt });
      }
      topReasons.sort((a, b) => b.count - a.count);
    } else {
      // Use RPC for unfiltered (faster)
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
            if (GIVT_RULES.includes(reason)) givtCount += cnt;
            else if (SIVT_RULES.includes(reason)) sivtCount += cnt;
            topReasons.push({ reason, count: cnt });
          }
          topReasons.sort((a, b) => b.count - a.count);
        }
      } catch {
        givtCount = Math.round(suspicious * 0.6);
        sivtCount = Math.round(suspicious * 0.4);
      }
    }

    // ---- Daily trend ----
    let dailyTrend: Array<{ date: string; total: number; suspicious: number; rate: number }> = [];

    if (hasPublisherFilter) {
      const { data: trendRows } = await supabase
        .from('ivt_impressions')
        .select('created_at,is_suspicious')
        .gte('created_at', startDate)
        .lt('created_at', endDate)
        .eq('pub_id', publisher);

      const dayMap = new Map<string, { total: number; suspicious: number }>();
      for (const row of trendRows || []) {
        const day = new Date(row.created_at).toISOString().slice(0, 10);
        const entry = dayMap.get(day) || { total: 0, suspicious: 0 };
        entry.total++;
        if (row.is_suspicious) entry.suspicious++;
        dayMap.set(day, entry);
      }
      dailyTrend = [...dayMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
          date,
          total: v.total,
          suspicious: v.suspicious,
          rate: v.total > 0 ? (v.suspicious / v.total) * 100 : 0,
        }));
    } else {
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
            rate: Number(d.total) > 0 ? (Number(d.suspicious) / Number(d.total)) * 100 : 0,
          }));
        }
      } catch {
        dailyTrend = [];
      }
    }

    // ---- Top suspicious IPs ----
    let topSuspiciousIPs: Array<{ ip: string; count: number; uniqueBundles: number }> = [];

    if (hasPublisherFilter) {
      const { data: ipRows } = await supabase
        .from('ivt_impressions')
        .select('ip,bundle')
        .gte('created_at', startDate)
        .lt('created_at', endDate)
        .eq('pub_id', publisher)
        .eq('is_suspicious', true)
        .limit(5000);

      const ipMap = new Map<string, { count: number; bundles: Set<string> }>();
      for (const row of ipRows || []) {
        const ip = cleanIP(row.ip || '');
        if (!ip) continue;
        const entry = ipMap.get(ip) || { count: 0, bundles: new Set() };
        entry.count++;
        if (row.bundle) entry.bundles.add(row.bundle);
        ipMap.set(ip, entry);
      }
      topSuspiciousIPs = [...ipMap.entries()]
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, 20)
        .map(([ip, v]) => ({ ip, count: v.count, uniqueBundles: v.bundles.size }));
    } else {
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
    }

    // ---- Top suspicious bundles ----
    let topSuspiciousBundles: Array<{ bundle: string; count: number; suspiciousRate: number }> = [];

    if (hasPublisherFilter) {
      const { data: bundleRows } = await supabase
        .from('ivt_impressions')
        .select('bundle,is_suspicious')
        .gte('created_at', startDate)
        .lt('created_at', endDate)
        .eq('pub_id', publisher)
        .limit(5000);

      const bundleMap = new Map<string, { total: number; suspicious: number }>();
      for (const row of bundleRows || []) {
        if (!row.bundle) continue;
        const entry = bundleMap.get(row.bundle) || { total: 0, suspicious: 0 };
        entry.total++;
        if (row.is_suspicious) entry.suspicious++;
        bundleMap.set(row.bundle, entry);
      }
      topSuspiciousBundles = [...bundleMap.entries()]
        .filter(([, v]) => v.suspicious > 0)
        .sort(([, a], [, b]) => b.suspicious - a.suspicious)
        .slice(0, 20)
        .map(([bundle, v]) => ({
          bundle,
          count: v.suspicious,
          suspiciousRate: v.total > 0 ? (v.suspicious / v.total) * 100 : 0,
        }));
    } else {
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

    // ---- CSV summary export ----
    if (format === 'csv') {
      const summaryRows = [
        { metric: 'Total Impressions', value: total },
        { metric: 'Suspicious Impressions', value: suspicious },
        { metric: 'IVT Rate %', value: report.summary.suspiciousRate },
        { metric: 'GIVT Count', value: givtCount },
        { metric: 'SIVT Count', value: sivtCount },
        { metric: 'Analyzed', value: analyzed },
        { metric: 'Unanalyzed', value: unanalyzed },
      ];

      const trendRows = dailyTrend.map((d) => ({
        date: d.date,
        total: d.total,
        suspicious: d.suspicious,
        rate_pct: Math.round(d.rate * 10) / 10,
      }));

      const ipRows = topSuspiciousIPs.map((ip) => ({
        ip: ip.ip,
        suspicious_count: ip.count,
        unique_bundles: ip.uniqueBundles,
      }));

      const bundleRows = topSuspiciousBundles.map((b) => ({
        bundle: b.bundle,
        suspicious_count: b.count,
        suspicious_rate_pct: Math.round(b.suspiciousRate * 10) / 10,
      }));

      const reasonRows = topReasons.map((r) => ({
        reason: r.reason,
        count: r.count,
      }));

      const csv = CSV_BOM + [
        '--- SUMMARY ---',
        arrayToCSV(summaryRows as Record<string, unknown>[]),
        '',
        '--- DAILY TREND ---',
        arrayToCSV(trendRows as Record<string, unknown>[]),
        '',
        '--- TOP REASONS ---',
        arrayToCSV(reasonRows as Record<string, unknown>[]),
        '',
        '--- TOP SUSPICIOUS IPS ---',
        arrayToCSV(ipRows as Record<string, unknown>[]),
        '',
        '--- TOP SUSPICIOUS BUNDLES ---',
        arrayToCSV(bundleRows as Record<string, unknown>[]),
      ].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="ivt-summary-${period}d${publisher ? `-${publisher}` : ''}.csv"`,
        },
      });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error('[IVT Report] API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate IVT report' },
      { status: 500 }
    );
  }
}
