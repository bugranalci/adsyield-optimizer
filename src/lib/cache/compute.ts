import { createServiceClient } from '@/lib/supabase/server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// ─── Cache helpers ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveCache(supabase: ReturnType<typeof createServiceClient>, key: string, data: any) {
  const { error } = await supabase.from('data_cache')
    .upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) console.error(`[Cache] Failed to save ${key}:`, error.message);
  else console.log(`[Cache] Saved: ${key}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readCache(key: string): Promise<any | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('data_cache').select('data').eq('key', key).single();
  if (error || !data) return null;
  return data.data;
}

// ─── Helpers ─────────────────────────────────────────────────

function fmt(d: Date): string { return d.toISOString().split('T')[0]; }
function calcChange(curr: number, prev: number): number { return prev > 0 ? ((curr - prev) / prev) * 100 : 0; }
function daysAgo(n: number): Date { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function v(val: unknown): number { if (val === undefined || val === null) return 0; const num = Number(val); return isNaN(num) ? 0 : num; }

// ─── Main refresh (uses SQL aggregate functions via RPC) ─────

export async function refreshAllCaches() {
  const supabase = createServiceClient();
  console.log('[Cache] Starting full cache refresh via RPC...');

  const yesterday = fmt(daysAgo(1));
  const start7 = fmt(daysAgo(7));
  const prevStart = fmt(daysAgo(14));
  const prevEnd = fmt(daysAgo(8));

  // Helper to run a single RPC call with error checking
  async function rpc(fn: string, params: Record<string, string>): Promise<Row[]> {
    const { data, error } = await supabase.rpc(fn, params);
    if (error) throw new Error(`RPC ${fn} error: ${error.message}`);
    return (data || []) as Row[];
  }

  // Run queries sequentially to avoid overwhelming the DB
  // Batch 1: current period core queries
  const partners = await rpc('agg_by_demand_partner', { p_start: start7, p_end: yesterday });
  const publishers = await rpc('agg_by_publisher', { p_start: start7, p_end: yesterday });
  const dates = await rpc('agg_by_date', { p_start: start7, p_end: yesterday });
  console.log(`[Cache] Batch 1 done: ${partners.length} partners, ${publishers.length} publishers, ${dates.length} dates`);

  // Batch 2: current period extra queries
  const bundles = await rpc('agg_by_bundle', { p_start: start7, p_end: yesterday });
  const adTypes = await rpc('agg_by_ad_unit_type', { p_start: start7, p_end: yesterday });
  const cross = await rpc('agg_by_demand_publisher', { p_start: start7, p_end: yesterday });
  console.log(`[Cache] Batch 2 done: ${bundles.length} bundles, ${adTypes.length} ad types, ${cross.length} cross`);

  // Batch 3: previous period (for comparison)
  const prevPublishers = await rpc('agg_by_publisher', { p_start: prevStart, p_end: prevEnd });
  const prevDates = await rpc('agg_by_date', { p_start: prevStart, p_end: prevEnd });
  console.log(`[Cache] Batch 3 done: prev ${prevPublishers.length} publishers, ${prevDates.length} dates`);

  console.log(`[Cache] Fetched aggregates: ${partners.length} partners, ${publishers.length} publishers, ${bundles.length} bundles, ${adTypes.length} ad types, ${dates.length} dates, ${cross.length} cross`);

  // Compute and save all 10 caches in parallel
  await Promise.all([
    saveCache(supabase, 'dashboard', computeDashboard(partners, publishers, bundles, dates, prevDates)),
    saveCache(supabase, 'bundles_7', computeBundles(bundles)),
    saveCache(supabase, 'ad_sizes_7', computeAdSizes(adTypes)),
    saveCache(supabase, 'partners_7', computePartners(partners, publishers, cross)),
    saveCache(supabase, 'quality_7', computeQuality(publishers, prevPublishers)),
    saveCache(supabase, 'demand_appetite_7', computeDemandAppetite(partners, cross)),
    saveCache(supabase, 'timeouts_7', computeTimeouts(partners, dates)),
    saveCache(supabase, 'concentration_7', computeConcentration(partners, publishers)),
    saveCache(supabase, 'filters_7', computeFilters(partners, dates)),
    saveCache(supabase, 'creative_7', computeCreative(partners, dates)),
  ]);

  // Batch 4: Alerts cache (needs current + previous partner data)
  const alertsData = computeAlerts(partners, prevPublishers, publishers);
  await saveCache(supabase, 'alerts_7', alertsData);
  console.log(`[Cache] Saved: alerts_7 (${alertsData.alerts.length} alerts)`);

  // Batch 5: Recommendations cache (needs partners + publishers + cross)
  const recsData = computeRecommendations(partners, publishers, cross);
  await saveCache(supabase, 'recommendations_7', recsData);
  console.log(`[Cache] Saved: recommendations_7 (${recsData.recommendations.length} recs)`);

  // Batch 6: IVT report cache (lightweight summary from RPC)
  try {
    const ivtNow = new Date();
    const ivtStart = new Date(ivtNow);
    ivtStart.setDate(ivtStart.getDate() - 7);
    const ivtStartTs = ivtStart.toISOString();
    const ivtEndTs = ivtNow.toISOString();

    const [totalRes, suspiciousRes, analyzedRes] = await Promise.all([
      supabase.from('ivt_impressions').select('*', { count: 'exact', head: true }).gte('created_at', ivtStartTs).lt('created_at', ivtEndTs),
      supabase.from('ivt_impressions').select('*', { count: 'exact', head: true }).gte('created_at', ivtStartTs).lt('created_at', ivtEndTs).eq('is_suspicious', true),
      supabase.from('ivt_impressions').select('*', { count: 'exact', head: true }).gte('created_at', ivtStartTs).lt('created_at', ivtEndTs).not('analyzed_at', 'is', null),
    ]);

    const total = totalRes.count ?? 0;
    const suspiciousCount = suspiciousRes.count ?? 0;
    const analyzed = analyzedRes.count ?? 0;

    // RPC calls for IVT details
    const [reasonRes, trendRes, ipRes, bundleRes] = await Promise.all([
      supabase.rpc('get_ivt_reason_counts', { start_ts: ivtStartTs, end_ts: ivtEndTs }),
      supabase.rpc('get_ivt_daily_trend', { start_ts: ivtStartTs, end_ts: ivtEndTs }),
      supabase.rpc('get_ivt_top_ips', { start_ts: ivtStartTs, end_ts: ivtEndTs }),
      supabase.rpc('get_ivt_top_bundles', { start_ts: ivtStartTs, end_ts: ivtEndTs }),
    ]);

    const GIVT_RULES = ['invalid_ifa', 'datacenter_ip', 'bot_user_agent', 'invalid_bundle'];
    const SIVT_RULES = ['high_freq_ifa', 'high_freq_ip', 'device_os_mismatch'];
    let givtCount = 0, sivtCount = 0;
    const topReasons: Array<{ reason: string; count: number }> = [];
    if (reasonRes.data && Array.isArray(reasonRes.data)) {
      for (const row of reasonRes.data) {
        const reason = (row.reason as string) || '';
        const cnt = Number(row.cnt) || 0;
        if (GIVT_RULES.includes(reason)) givtCount += cnt;
        else if (SIVT_RULES.includes(reason)) sivtCount += cnt;
        topReasons.push({ reason, count: cnt });
      }
      topReasons.sort((a, b) => b.count - a.count);
    }

    const dailyTrend = (trendRes.data || []).map((d: { day: string; total: number; suspicious: number }) => ({
      date: d.day,
      total: Number(d.total),
      suspicious: Number(d.suspicious),
      rate: Number(d.total) > 0 ? (Number(d.suspicious) / Number(d.total)) * 100 : 0,
    }));

    const topSuspiciousIPs = (ipRes.data || []).map((r: { ip: string; cnt: number; unique_bundles: number }) => ({
      ip: (r.ip || '').replace(/\/\d+$/, ''),
      count: Number(r.cnt),
      uniqueBundles: Number(r.unique_bundles),
    }));

    const topSuspiciousBundles = (bundleRes.data || []).map((r: { bundle: string; suspicious_count: number; suspicious_rate: number }) => ({
      bundle: r.bundle,
      count: Number(r.suspicious_count),
      suspiciousRate: Number(r.suspicious_rate),
    }));

    const ivtReport = {
      summary: {
        totalImpressions: total,
        suspiciousImpressions: suspiciousCount,
        suspiciousRate: total > 0 ? Math.round((suspiciousCount / total) * 1000) / 10 : 0,
        givtCount,
        sivtCount,
        analyzedCount: analyzed,
        unanalyzedCount: total - analyzed,
      },
      topReasons,
      topSuspiciousIPs,
      topSuspiciousBundles,
      dailyTrend,
    };

    await saveCache(supabase, 'ivt_report_7', ivtReport);
    console.log(`[Cache] Saved: ivt_report_7`);
  } catch (ivtErr) {
    console.error('[Cache] IVT report cache failed (non-fatal):', ivtErr);
  }

  // Batch 7: Chat performance context cache
  const chatContext = computeChatContext(partners, publishers, dates, prevDates);
  await saveCache(supabase, 'chat_context_7', chatContext);
  console.log(`[Cache] Saved: chat_context_7`);

  // Store alerts in alerts table (same as the alerts endpoint did)
  if (alertsData.alerts.length > 0) {
    const now = new Date().toISOString();
    const alertRows = alertsData.alerts.map((alert: { type: string; severity: string; metric: string; currentValue: number; previousValue: number; changePct: number; message: string; partner: string }) => ({
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
    const { error: insertError } = await supabase.from('alerts').insert(alertRows);
    if (insertError) console.error('[Cache] Failed to store alerts in DB:', insertError.message);
    else console.log(`[Cache] Stored ${alertRows.length} alerts in DB`);
  }

  console.log('[Cache] All caches refreshed');
}

// ═══════════════════════════════════════════════════════════════
// COMPUTE FUNCTIONS - each matches its API endpoint exact output
// Input: pre-aggregated rows from SQL GROUP BY (not raw rows)
// ═══════════════════════════════════════════════════════════════

// ─── DASHBOARD ──────────────────────────────────────────────────

function computeDashboard(partners: Row[], publishers: Row[], bundles: Row[], dates: Row[], prevDates: Row[]) {
  // Current totals from date aggregates (includes all rows)
  const totalRevenue = dates.reduce((s, r) => s + v(r.revenue), 0);
  const totalImpressions = dates.reduce((s, r) => s + v(r.impressions), 0);
  const totalBidRequests = dates.reduce((s, r) => s + v(r.bid_requests), 0);
  const avgECPM = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;
  const fillRate = totalBidRequests > 0 ? (totalImpressions / totalBidRequests) * 100 : 0;

  // Previous totals from prev date aggregates
  const prevRevenue = prevDates.reduce((s, r) => s + v(r.revenue), 0);
  const prevImpressions = prevDates.reduce((s, r) => s + v(r.impressions), 0);
  const prevBidRequests = prevDates.reduce((s, r) => s + v(r.bid_requests), 0);
  const prevECPM = prevImpressions > 0 ? (prevRevenue / prevImpressions) * 1000 : 0;
  const prevFillRate = prevBidRequests > 0 ? (prevImpressions / prevBidRequests) * 100 : 0;

  // Top partners (already grouped by demand partner)
  const topPartners = partners
    .map(r => ({
      name: r.name,
      revenue: v(r.revenue),
      impressions: v(r.impressions),
      ecpm: v(r.impressions) > 0 ? (v(r.revenue) / v(r.impressions)) * 1000 : 0,
      fillRate: v(r.bid_requests) > 0 ? (v(r.impressions) / v(r.bid_requests)) * 100 : 0,
      timeoutRate: v(r.bid_requests) > 0 ? (v(r.timeouts) / v(r.bid_requests)) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // Top publishers (already grouped by publisher)
  const topPublishers = publishers
    .map(r => ({
      name: r.name,
      revenue: v(r.revenue),
      impressions: v(r.impressions),
      pubPayout: v(r.pub_payout),
      ecpm: v(r.impressions) > 0 ? (v(r.revenue) / v(r.impressions)) * 1000 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // Top bundles (already grouped by bundle)
  const topBundles = bundles
    .filter(r => v(r.impressions) > 0)
    .map(r => ({ bundle: r.name, revenue: v(r.revenue), impressions: v(r.impressions) }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // Daily trend (already grouped by date)
  const dailyTrend = dates
    .map(r => ({ date: r.date, revenue: v(r.revenue), impressions: v(r.impressions) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalRevenue, totalImpressions, avgECPM, fillRate,
    revenueChange: calcChange(totalRevenue, prevRevenue),
    impressionChange: calcChange(totalImpressions, prevImpressions),
    ecpmChange: calcChange(avgECPM, prevECPM),
    fillRateChange: calcChange(fillRate, prevFillRate),
    topPartners, topPublishers, topBundles, dailyTrend,
  };
}

// ─── BUNDLES ────────────────────────────────────────────────────

function computeBundles(data: Row[]) {
  const bList = data
    .filter(r => v(r.impressions) > 0)
    .map(r => {
      const imp = v(r.impressions), rev = v(r.revenue), br = v(r.bid_requests);
      const bi = v(r.bids), wi = v(r.wins);
      return {
        bundle: r.name, impressions: imp, revenue: rev, bidRequests: br, bids: bi, wins: wi,
        opportunities: v(r.opportunities), timeouts: v(r.timeouts), errors: v(r.errors), pubPayout: v(r.pub_payout),
        ecpm: imp > 0 ? (rev / imp) * 1000 : 0,
        fillRate: br > 0 ? (imp / br) * 100 : 0,
        bidRate: br > 0 ? (bi / br) * 100 : 0,
        winRate: bi > 0 ? (wi / bi) * 100 : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue).slice(0, 100);

  const totalRevenue = bList.reduce((s, b) => s + b.revenue, 0);
  const totalImpressions = bList.reduce((s, b) => s + b.impressions, 0);
  const totalBidRequests = bList.reduce((s, b) => s + b.bidRequests, 0);
  return {
    bundles: bList,
    summary: {
      totalBundles: bList.length, totalRevenue, totalImpressions,
      avgECPM: totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0,
      overallFillRate: totalBidRequests > 0 ? (totalImpressions / totalBidRequests) * 100 : 0,
    },
    period: 7,
  };
}

// ─── AD SIZES ───────────────────────────────────────────────────

function computeAdSizes(data: Row[]) {
  const sizes = data
    .filter(r => v(r.impressions) > 0)
    .map(r => {
      const imp = v(r.impressions), rev = v(r.revenue);
      const br = v(r.bid_requests), bi = v(r.bids), wi = v(r.wins);
      return {
        size: r.name, impressions: imp,
        revenue: Math.round(rev * 100) / 100,
        bidRequests: br, bids: bi, wins: wi,
        eCPM: imp > 0 ? Math.round((rev / imp) * 1000 * 100) / 100 : 0,
        fillRate: br > 0 ? Math.round((imp / br) * 100 * 100) / 100 : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue).slice(0, 50);

  const totalRevenue = sizes.reduce((s, x) => s + x.revenue, 0);
  const totalImpressions = sizes.reduce((s, x) => s + x.impressions, 0);
  return {
    period: 7, totalSizes: sizes.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100, totalImpressions,
    avgECPM: totalImpressions > 0 ? Math.round((totalRevenue / totalImpressions) * 1000 * 100) / 100 : 0,
    sizes,
  };
}

// ─── PARTNERS ───────────────────────────────────────────────────

function computePartners(partnerData: Row[], publisherData: Row[], crossData: Row[]) {
  const buildPartner = (r: Row) => {
    const imp = v(r.impressions), rev = v(r.revenue), br = v(r.bid_requests);
    const bi = v(r.bids), wi = v(r.wins), to = v(r.timeouts), er = v(r.errors);
    return {
      name: r.name, revenue: rev, impressions: imp, bidRequests: br, bids: bi, wins: wi, timeouts: to, errors: er,
      ecpm: imp > 0 ? (rev / imp) * 1000 : 0,
      fillRate: br > 0 ? (imp / br) * 100 : 0,
      timeoutRate: br > 0 ? (to / br) * 100 : 0,
    };
  };

  const buildPublisher = (r: Row) => {
    const imp = v(r.impressions), rev = v(r.revenue), br = v(r.bid_requests);
    const bi = v(r.bids), wi = v(r.wins), to = v(r.timeouts), er = v(r.errors), pp = v(r.pub_payout);
    return {
      name: r.name, revenue: rev, impressions: imp, bidRequests: br, bids: bi, wins: wi, timeouts: to, errors: er, pubPayout: pp,
      ecpm: imp > 0 ? (rev / imp) * 1000 : 0,
      fillRate: br > 0 ? (imp / br) * 100 : 0,
      timeoutRate: br > 0 ? (to / br) * 100 : 0,
    };
  };

  return {
    period: 7,
    demandPartners: partnerData.map(r => buildPartner(r)).sort((a, b) => b.revenue - a.revenue),
    publishers: publisherData.map(r => buildPublisher(r)).sort((a, b) => b.revenue - a.revenue),
    crossReference: crossData.map(r => {
      const imp = v(r.impressions), rev = v(r.revenue), br = v(r.bid_requests), to = v(r.timeouts);
      return {
        demandPartner: r.demand_partner, publisher: r.publisher || 'Unknown',
        revenue: rev, impressions: imp, bidRequests: br,
        ecpm: imp > 0 ? (rev / imp) * 1000 : 0,
        fillRate: br > 0 ? (imp / br) * 100 : 0,
        timeoutRate: br > 0 ? (to / br) * 100 : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue),
  };
}

// ─── QUALITY ────────────────────────────────────────────────────

function normalizeToOptimal(value: number, optimal: number): number {
  if (optimal <= 0) return 0;
  return value >= optimal ? 90 : (value / optimal) * 90;
}

function qScore(a: { bidRequests: number; bids: number; wins: number; impressions: number }): number {
  const bidRate = a.bidRequests > 0 ? (a.bids / a.bidRequests) * 100 : 0;
  const winRate = a.bids > 0 ? (a.wins / a.bids) * 100 : 0;
  const fillRate = a.bidRequests > 0 ? (a.impressions / a.bidRequests) * 100 : 0;
  const successRate = a.wins > 0 ? (a.impressions / a.wins) * 100 : 0;
  return Math.min(100, normalizeToOptimal(bidRate, 80) * 0.25 + normalizeToOptimal(winRate, 30) * 0.25 +
    normalizeToOptimal(fillRate, 70) * 0.20 + normalizeToOptimal(successRate, 100) * 0.30);
}

function computeQuality(currData: Row[], prevData: Row[]) {
  const prevMap = new Map<string, Row>();
  for (const r of prevData) prevMap.set(r.name, r);

  const publishers = currData.map(r => {
    const imp = v(r.impressions), br = v(r.bid_requests), bi = v(r.bids), wi = v(r.wins);
    const to = v(r.timeouts), rev = v(r.revenue);
    const qs = qScore({ bidRequests: br, bids: bi, wins: wi, impressions: imp });
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    const prevR = prevMap.get(r.name);
    if (prevR) {
      const prevQS = qScore({ bidRequests: v(prevR.bid_requests), bids: v(prevR.bids), wins: v(prevR.wins), impressions: v(prevR.impressions) });
      const diff = qs - prevQS;
      if (diff > 3) trend = 'improving'; else if (diff < -3) trend = 'declining';
    }
    return {
      publisher: r.name, qualityScore: Math.round(qs * 10) / 10,
      bidRate: br > 0 ? Math.round((bi / br) * 100 * 100) / 100 : 0,
      winRate: bi > 0 ? Math.round((wi / bi) * 100 * 100) / 100 : 0,
      fillRate: br > 0 ? Math.round((imp / br) * 100 * 100) / 100 : 0,
      revenue: rev, impressions: imp, bidRequests: br, timeouts: to, trend,
    };
  }).sort((a, b) => b.qualityScore - a.qualityScore);

  const total = publishers.length;
  const avgQS = total > 0 ? Math.round((publishers.reduce((s, p) => s + p.qualityScore, 0) / total) * 10) / 10 : 0;
  return {
    summary: { avgQualityScore: avgQS, totalPublishers: total, highQuality: publishers.filter(p => p.qualityScore > 70).length, lowQuality: publishers.filter(p => p.qualityScore < 40).length },
    publishers,
  };
}

// ─── DEMAND APPETITE ────────────────────────────────────────────

function computeDemandAppetite(partnerData: Row[], crossData: Row[]) {
  // Build publisher breakdown per partner from cross aggregates
  const pubByPartner = new Map<string, { name: string; revenue: number; impressions: number }[]>();
  for (const r of crossData) {
    const partner = r.demand_partner;
    const publisher = r.publisher || 'Unknown';
    if (!partner || publisher === 'Unknown' || publisher === '' || !publisher) continue;
    const list = pubByPartner.get(partner) || [];
    list.push({ name: publisher, revenue: v(r.revenue), impressions: v(r.impressions) });
    pubByPartner.set(partner, list);
  }

  const demandPartners = partnerData
    .map(r => {
      const nm = r.name;
      const imp = v(r.impressions), rev = v(r.revenue), br = v(r.bid_requests);
      const bi = v(r.bids), wi = v(r.wins), opp = v(r.opportunities);
      const to = v(r.timeouts);
      const pubs = pubByPartner.get(nm) || [];
      const topPublishers = pubs.sort((a, b) => b.revenue - a.revenue).slice(0, 5);
      return {
        name: nm, revenue: rev, impressions: imp, bidRequests: br,
        bids: bi, wins: wi, opportunities: opp,
        winRate: bi > 0 ? (wi / bi) * 100 : 0,
        bidRate: br > 0 ? (bi / br) * 100 : 0,
        avgBidPrice: imp > 0 ? rev / imp : 0,
        timeoutRate: br > 0 ? (to / br) * 100 : 0,
        fillRate: br > 0 ? (imp / br) * 100 : 0,
        topPublishers,
      };
    })
    .sort((a, b) => b.revenue - a.revenue).slice(0, 30);

  const totalPartners = demandPartners.length;
  const avgWinRate = totalPartners > 0 ? demandPartners.reduce((s, p) => s + p.winRate, 0) / totalPartners : 0;
  const highestBidder = demandPartners.length > 0
    ? demandPartners.reduce((max, p) => p.avgBidPrice > max.avgBidPrice ? p : max, demandPartners[0])
    : null;

  return {
    period: 7,
    summary: {
      totalPartners, avgWinRate,
      highestBidder: highestBidder ? { name: highestBidder.name, avgBidPrice: highestBidder.avgBidPrice } : null,
      totalRevenue: demandPartners.reduce((s, p) => s + p.revenue, 0),
      totalImpressions: demandPartners.reduce((s, p) => s + p.impressions, 0),
    },
    demandPartners,
  };
}

// ─── TIMEOUTS ───────────────────────────────────────────────────

function computeTimeouts(partnerData: Row[], dateData: Row[]) {
  const totalImp = partnerData.reduce((s, r) => s + v(r.impressions), 0);
  const totalRev = partnerData.reduce((s, r) => s + v(r.revenue), 0);
  const averageEcpm = totalImp > 0 ? (totalRev / totalImp) * 1000 : 0;

  const partners = partnerData
    .filter(r => v(r.bid_requests) > 0)
    .map(r => {
      const totalRequests = v(r.bid_requests), timeouts = v(r.timeouts), errors = v(r.errors);
      const impressions = v(r.impressions), revenue = v(r.revenue);
      return {
        name: r.name, totalRequests, timeouts, errors, impressions, revenue,
        timeoutRate: totalRequests > 0 ? (timeouts / totalRequests) * 100 : 0,
        errorRate: totalRequests > 0 ? (errors / totalRequests) * 100 : 0,
        estimatedRevenueLoss: (timeouts * averageEcpm) / 1000,
      };
    })
    .sort((a, b) => b.timeoutRate - a.timeoutRate);

  const dailyTrend = dateData
    .map(r => {
      const totalTimeouts = v(r.timeouts), totalRequests = v(r.bid_requests), totalErrors = v(r.errors);
      return {
        date: r.date, totalTimeouts, totalRequests, totalErrors,
        timeoutRate: totalRequests > 0 ? (totalTimeouts / totalRequests) * 100 : 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const sTR = partners.reduce((s, p) => s + p.totalRequests, 0);
  const sTO = partners.reduce((s, p) => s + p.timeouts, 0);
  const sER = partners.reduce((s, p) => s + p.errors, 0);

  return {
    summary: { totalTimeouts: sTO, avgTimeoutRate: sTR > 0 ? (sTO / sTR) * 100 : 0,
      estimatedRevenueLoss: (sTO * averageEcpm) / 1000, totalErrors: sER, totalRequests: sTR },
    partners, dailyTrend, period: 7,
  };
}

// ─── CONCENTRATION ──────────────────────────────────────────────

function computeConcentration(partnerData: Row[], publisherData: Row[]) {
  const conc = (data: Row[]) => {
    const total = data.reduce((s, r) => s + v(r.revenue), 0);
    const dist = data.map(r => ({
      name: r.name, revenue: v(r.revenue),
      share: total > 0 ? (v(r.revenue) / total) * 100 : 0,
    })).sort((a, b) => b.revenue - a.revenue);
    const hhi = dist.reduce((s, e) => s + e.share * e.share, 0);
    return {
      distribution: dist,
      top5Share: Math.round(dist.slice(0, 5).reduce((s, e) => s + e.share, 0) * 100) / 100,
      top10Share: Math.round(dist.slice(0, 10).reduce((s, e) => s + e.share, 0) * 100) / 100,
      hhi: Math.round(hhi), count: dist.length,
    };
  };
  const risk = (hhi: number): 'low' | 'medium' | 'high' => hhi < 1500 ? 'low' : hhi <= 2500 ? 'medium' : 'high';

  const demand = conc(partnerData);
  const publisher = conc(publisherData);
  const dr = risk(demand.hhi), pr = risk(publisher.hhi);
  const ro = { low: 0, medium: 1, high: 2 };

  return {
    demand: { hhi: demand.hhi, top5Share: demand.top5Share, top10Share: demand.top10Share, risk: dr, count: demand.count, distribution: demand.distribution },
    publisher: { hhi: publisher.hhi, top5Share: publisher.top5Share, top10Share: publisher.top10Share, risk: pr, count: publisher.count, distribution: publisher.distribution },
    overallRisk: ro[dr] >= ro[pr] ? dr : pr,
    totalRevenue: partnerData.reduce((s, r) => s + v(r.revenue), 0),
  };
}

// ─── FILTERS ────────────────────────────────────────────────────

function computeFilters(partnerData: Row[], dateData: Row[]) {
  // Use date totals for average eCPM (includes all data)
  const totalImp = dateData.reduce((s, r) => s + v(r.impressions), 0);
  const totalRev = dateData.reduce((s, r) => s + v(r.revenue), 0);
  const averageEcpm = totalImp > 0 ? (totalRev / totalImp) * 1000 : 0;

  const partners = partnerData
    .filter(r => v(r.bid_requests) > 0)
    .map(r => {
      const br = v(r.bid_requests), bi = v(r.bids), wi = v(r.wins);
      const imp = v(r.impressions), to = v(r.timeouts), er = v(r.errors), rev = v(r.revenue);
      const lossRate = bi > 0 ? (1 - imp / bi) * 100 : 0;
      const lostBids = Math.max(0, bi - imp);
      return {
        name: r.name, bidRequests: br, bids: bi, wins: wi, impressions: imp,
        timeouts: to, errors: er, revenue: rev,
        lossRate: Math.max(0, lossRate),
        timeoutRate: br > 0 ? (to / br) * 100 : 0,
        bidResponseRate: br > 0 ? (bi / br) * 100 : 0,
        fillRate: br > 0 ? (imp / br) * 100 : 0,
        timeoutRevenueLoss: (to * averageEcpm) / 1000,
        lostBids, lostBidRevenue: (lostBids * averageEcpm) / 1000,
      };
    }).sort((a, b) => b.lossRate - a.lossRate);

  const highBidLowWin = partners.filter(p => p.bids > 100 && p.lossRate > 30).sort((a, b) => b.lostBidRevenue - a.lostBidRevenue);
  const highTimeouts = partners.filter(p => p.timeoutRate > 5).sort((a, b) => b.timeoutRevenueLoss - a.timeoutRevenueLoss);

  const sBR = partners.reduce((s, p) => s + p.bidRequests, 0);
  const sBI = partners.reduce((s, p) => s + p.bids, 0);
  const sWI = partners.reduce((s, p) => s + p.wins, 0);
  const sIM = partners.reduce((s, p) => s + p.impressions, 0);
  const sTO = partners.reduce((s, p) => s + p.timeouts, 0);
  const sER = partners.reduce((s, p) => s + p.errors, 0);
  const sLB = partners.reduce((s, p) => s + p.lostBids, 0);
  const sTLR = partners.reduce((s, p) => s + p.timeoutRevenueLoss + p.lostBidRevenue, 0);

  return {
    summary: { totalBidRequests: sBR, totalBids: sBI, totalWins: sWI, totalImpressions: sIM,
      totalTimeouts: sTO, totalErrors: sER, totalLostBids: sLB, estimatedLostRevenue: sTLR,
      overallLossRate: Math.max(0, sBI > 0 ? (1 - sIM / sBI) * 100 : 0), averageEcpm },
    partners, highBidLowWin, highTimeouts, period: 7,
  };
}

// ─── CREATIVE ───────────────────────────────────────────────────

function computeCreative(partnerData: Row[], dateData: Row[]) {
  const partners = partnerData
    .filter(r => v(r.bids) > 0 || v(r.impressions) > 0)
    .map(r => {
      const imp = v(r.impressions), bi = v(r.bids), wi = v(r.wins);
      const rev = v(r.revenue), br = v(r.bid_requests), opp = v(r.opportunities);
      return {
        name: r.name, impressions: imp, bids: bi, wins: wi, revenue: rev,
        bidRequests: br, opportunities: opp,
        winRate: bi > 0 ? (wi / bi) * 100 : 0,
        renderRate: wi > 0 ? (imp / wi) * 100 : 0,
        ecpm: imp > 0 ? (rev / imp) * 1000 : 0,
        bidRate: br > 0 ? (bi / br) * 100 : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const tI = partners.reduce((s, p) => s + p.impressions, 0);
  const tB = partners.reduce((s, p) => s + p.bids, 0);
  const tW = partners.reduce((s, p) => s + p.wins, 0);
  const tR = partners.reduce((s, p) => s + p.revenue, 0);
  const tBR = partners.reduce((s, p) => s + p.bidRequests, 0);

  const dailyTrend = dateData
    .map(r => ({ date: r.date, impressions: v(r.impressions), wins: v(r.wins), revenue: v(r.revenue) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    summary: { totalImpressions: tI, totalBids: tB, totalWins: tW, totalRevenue: tR, totalBidRequests: tBR,
      overallWinRate: tB > 0 ? (tW / tB) * 100 : 0, overallEcpm: tI > 0 ? (tR / tI) * 1000 : 0,
      overallBidRate: tBR > 0 ? (tB / tBR) * 100 : 0 },
    partners, dailyTrend, period: 7,
  };
}

// ─── ALERTS (computed from pre-aggregated RPC data) ─────────

interface AlertItem {
  type: 'performance' | 'revenue' | 'technical' | 'quality';
  severity: 'critical' | 'warning' | 'info';
  metric: string;
  partner: string;
  currentValue: number;
  previousValue: number;
  changePct: number;
  message: string;
}

function computeAlerts(partnerData: Row[], prevPublisherData: Row[], publisherData: Row[]) {
  const alerts: AlertItem[] = [];

  const prevPubMap = new Map<string, Row>();
  for (const r of prevPublisherData) prevPubMap.set(r.name, r);

  // Publisher-level alerts: revenue drops, fill rate drops
  for (const curr of publisherData) {
    const prev = prevPubMap.get(curr.name);
    if (!prev) continue;

    const currRev = v(curr.revenue), prevRev = v(prev.revenue);
    if (prevRev > 0) {
      const change = ((currRev - prevRev) / prevRev) * 100;
      if (change < -15) {
        alerts.push({
          type: 'revenue', severity: 'critical', metric: 'revenue', partner: curr.name,
          currentValue: Math.round(currRev * 100) / 100,
          previousValue: Math.round(prevRev * 100) / 100,
          changePct: Math.round(change * 100) / 100,
          message: `Revenue from ${curr.name} dropped ${Math.abs(Math.round(change))}% ($${Math.round(prevRev)} -> $${Math.round(currRev)})`,
        });
      } else if (change < -8) {
        alerts.push({
          type: 'revenue', severity: 'warning', metric: 'revenue', partner: curr.name,
          currentValue: Math.round(currRev * 100) / 100,
          previousValue: Math.round(prevRev * 100) / 100,
          changePct: Math.round(change * 100) / 100,
          message: `Revenue from ${curr.name} declined ${Math.abs(Math.round(change))}% ($${Math.round(prevRev)} -> $${Math.round(currRev)})`,
        });
      }
    }

    const currBR = v(curr.bid_requests), prevBR = v(prev.bid_requests);
    const currFR = currBR > 0 ? (v(curr.impressions) / currBR) * 100 : 0;
    const prevFR = prevBR > 0 ? (v(prev.impressions) / prevBR) * 100 : 0;
    if (prevBR > 0 && prevFR > 0) {
      const frChange = ((currFR - prevFR) / prevFR) * 100;
      if (frChange < -10) {
        alerts.push({
          type: 'performance', severity: 'warning', metric: 'fill_rate', partner: curr.name,
          currentValue: Math.round(currFR * 100) / 100,
          previousValue: Math.round(prevFR * 100) / 100,
          changePct: Math.round(frChange * 100) / 100,
          message: `Fill rate for ${curr.name} dropped ${Math.abs(Math.round(frChange))}% (${prevFR.toFixed(1)}% -> ${currFR.toFixed(1)}%)`,
        });
      }
    }
  }

  // Partner-level: timeout rate spikes
  for (const r of partnerData) {
    const br = v(r.bid_requests), to = v(r.timeouts);
    if (br < 10000) continue;
    const timeoutRate = (to / br) * 100;
    if (timeoutRate > 20) {
      alerts.push({
        type: 'technical', severity: 'warning', metric: 'timeout_rate', partner: r.name,
        currentValue: Math.round(timeoutRate * 100) / 100,
        previousValue: 0, changePct: 0,
        message: `Timeout rate for ${r.name} is ${timeoutRate.toFixed(1)}% across ${br.toLocaleString()} bid requests`,
      });
    }
  }

  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: alerts.length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      warning: alerts.filter(a => a.severity === 'warning').length,
      info: alerts.filter(a => a.severity === 'info').length,
    },
    alerts,
  };
}

// ─── RECOMMENDATIONS (computed from pre-aggregated RPC data) ─

function capRevenueLift(lift: number, currentRevenue: number): number {
  const partnerCap = Math.max(currentRevenue * 3, 50);
  return Math.round(Math.min(Math.max(lift, 0), partnerCap, 50000) * 100) / 100;
}

function computeRecommendations(partnerData: Row[], publisherData: Row[], _crossData: Row[]) {
  interface Rec {
    id: string; type: string; priority: string; title: string; description: string;
    estimatedRevenueLift: number; difficulty: string; actionSteps: string[];
    partner?: string; publisher?: string; currentValue?: number; targetValue?: number;
  }

  const recommendations: Rec[] = [];
  let recId = 1;

  const totalImp = partnerData.reduce((s, r) => s + v(r.impressions), 0);
  const totalRev = partnerData.reduce((s, r) => s + v(r.revenue), 0);
  const globalEcpm = totalImp > 0 ? (totalRev / totalImp) * 1000 : 0;
  const totalBids = partnerData.reduce((s, r) => s + v(r.bids), 0);
  const totalWins = partnerData.reduce((s, r) => s + v(r.wins), 0);
  const globalWinRate = totalBids > 0 ? (totalWins / totalBids) * 100 : 0;

  const pubFR: number[] = [];
  for (const r of publisherData) {
    const br = v(r.bid_requests), imp = v(r.impressions);
    if (br > 0 && imp > 0) pubFR.push((imp / br) * 100);
  }
  const avgPubFR = pubFR.length > 0 ? pubFR.reduce((s, x) => s + x, 0) / pubFR.length : 0;

  // Rule 1: Bid Floor
  for (const r of partnerData) {
    if (r.name === 'Unknown' || v(r.impressions) <= 1000) continue;
    const ecpm = (v(r.revenue) / v(r.impressions)) * 1000;
    if (ecpm < 1.5) {
      const lift = (v(r.impressions) * 0.3 * (1.5 - ecpm)) / 1000;
      recommendations.push({
        id: `rec-${recId++}`, type: 'partner-bid-floor',
        priority: ecpm < 0.5 ? 'critical' : ecpm < 1.0 ? 'high' : 'medium',
        title: `Increase bid floor for ${r.name}`,
        description: `eCPM $${ecpm.toFixed(2)} across ${v(r.impressions).toLocaleString()} impressions.`,
        estimatedRevenueLift: capRevenueLift(lift, v(r.revenue)), difficulty: 'easy',
        actionSteps: [`Review bid floor for ${r.name}`, 'Test $1.00 floor first', 'Monitor volume'],
        partner: r.name, currentValue: ecpm, targetValue: 1.5,
      });
    }
  }

  // Rule 2: Timeout Fix
  for (const r of partnerData) {
    if (r.name === 'Unknown' || v(r.bid_requests) <= 10000) continue;
    const toRate = (v(r.timeouts) / v(r.bid_requests)) * 100;
    if (toRate > 15) {
      const recoverable = v(r.timeouts) - (v(r.bid_requests) * 10 / 100);
      if (recoverable <= 0) continue;
      const bidRate = v(r.bids) > 0 ? v(r.bids) / v(r.bid_requests) : 0;
      const winRate = v(r.wins) > 0 ? v(r.wins) / v(r.bids) : 0;
      const pEcpm = v(r.impressions) > 0 ? (v(r.revenue) / v(r.impressions)) * 1000 : globalEcpm;
      const lift = (recoverable * Math.min(bidRate, 0.1) * Math.min(winRate, 0.5) * pEcpm) / 1000;
      recommendations.push({
        id: `rec-${recId++}`, type: 'timeout-fix',
        priority: toRate > 30 ? 'critical' : 'high',
        title: `Investigate timeouts for ${r.name}`,
        description: `${toRate.toFixed(1)}% timeout rate across ${v(r.bid_requests).toLocaleString()} bid requests.`,
        estimatedRevenueLift: capRevenueLift(lift, v(r.revenue)), difficulty: 'medium',
        actionSteps: [`Contact ${r.name}`, 'Check timeout thresholds', 'Review server logs'],
        partner: r.name, currentValue: toRate, targetValue: 10,
      });
    }
  }

  // Rule 3: Fill Rate
  for (const r of partnerData) {
    if (r.name === 'Unknown' || v(r.bid_requests) <= 0 || v(r.impressions) < 10) continue;
    const fr = (v(r.impressions) / v(r.bid_requests)) * 100;
    if (fr < 0.1 && v(r.revenue) > 10) {
      const lift = (v(r.impressions) * (v(r.revenue) / v(r.impressions)) * 1000) / 1000;
      recommendations.push({
        id: `rec-${recId++}`, type: 'fill-rate', priority: v(r.revenue) > 200 ? 'high' : 'medium',
        title: `Improve fill rate for ${r.name}`,
        description: `Fill rate ${fr.toFixed(4)}% with $${v(r.revenue).toFixed(0)} revenue.`,
        estimatedRevenueLift: capRevenueLift(lift, v(r.revenue)), difficulty: 'medium',
        actionSteps: [`Analyze bid params for ${r.name}`, 'Check ad formats', 'Review geo targeting'],
        partner: r.name, currentValue: fr, targetValue: fr * 2,
      });
    }
  }

  // Rule 4: Revenue Leakage
  for (const r of partnerData) {
    if (r.name === 'Unknown' || v(r.bids) < 100 || v(r.wins) < 5) continue;
    const wr = (v(r.wins) / v(r.bids)) * 100;
    if (wr < 5) {
      const target = Math.min(wr * 2, globalWinRate * 0.5, 10);
      if (target <= wr) continue;
      const lift = v(r.bids) * ((target - wr) / 100) * (v(r.revenue) / v(r.wins));
      recommendations.push({
        id: `rec-${recId++}`, type: 'revenue-leakage',
        priority: v(r.revenue) > 100 ? 'high' : 'medium',
        title: `Revenue leakage: ${r.name}`,
        description: `Win rate ${wr.toFixed(2)}% vs ${globalWinRate.toFixed(2)}% avg.`,
        estimatedRevenueLift: capRevenueLift(lift, v(r.revenue)), difficulty: 'hard',
        actionSteps: ['Review auction dynamics', 'Check bid latency', 'Analyze bid prices'],
        partner: r.name, currentValue: wr, targetValue: target,
      });
    }
  }

  // Rule 5: Publisher Quality
  const frThreshold = avgPubFR / 2;
  for (const r of publisherData) {
    if (r.name === 'Unknown' || v(r.bid_requests) < 5000 || v(r.impressions) < 10) continue;
    const fr = (v(r.impressions) / v(r.bid_requests)) * 100;
    if (fr < frThreshold && frThreshold > 0) {
      const targetFR = avgPubFR * 0.75;
      const addImp = v(r.bid_requests) * ((targetFR - fr) / 100);
      const pEcpm = (v(r.revenue) / v(r.impressions)) * 1000;
      const lift = (addImp * pEcpm) / 1000;
      recommendations.push({
        id: `rec-${recId++}`, type: 'publisher-quality',
        priority: v(r.revenue) > 100 ? 'high' : 'medium',
        title: `Low fill rate: ${r.name}`,
        description: `Fill rate ${fr.toFixed(3)}% vs ${avgPubFR.toFixed(3)}% avg.`,
        estimatedRevenueLift: capRevenueLift(lift, v(r.revenue)), difficulty: 'medium',
        actionSteps: ['Review ad placement quality', 'Check app-ads.txt', 'Add demand partners'],
        publisher: r.name, currentValue: fr, targetValue: targetFR,
      });
    }
  }

  recommendations.sort((a, b) => b.estimatedRevenueLift - a.estimatedRevenueLift);
  const totalLift = recommendations.reduce((s, r) => s + r.estimatedRevenueLift, 0);

  return {
    summary: {
      totalRecommendations: recommendations.length,
      criticalCount: recommendations.filter(r => r.priority === 'critical').length,
      highCount: recommendations.filter(r => r.priority === 'high').length,
      mediumCount: recommendations.filter(r => r.priority === 'medium').length,
      lowCount: recommendations.filter(r => r.priority === 'low').length,
      estimatedTotalRevenueLift: Math.round(totalLift * 100) / 100,
    },
    recommendations,
  };
}

// ─── CHAT CONTEXT (pre-computed for AI assistant) ────────────

function computeChatContext(partnerData: Row[], _publisherData: Row[], dates: Row[], prevDates: Row[]) {
  const totalRevenue = dates.reduce((s, r) => s + v(r.revenue), 0);
  const totalImpressions = dates.reduce((s, r) => s + v(r.impressions), 0);
  const totalBidRequests = dates.reduce((s, r) => s + v(r.bid_requests), 0);
  const avgECPM = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;
  const fillRate = totalBidRequests > 0 ? (totalImpressions / totalBidRequests) * 100 : 0;
  const prevRevenue = prevDates.reduce((s, r) => s + v(r.revenue), 0);
  const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

  const allPartners = partnerData.map(r => ({
    name: r.name,
    revenue: v(r.revenue),
    ecpm: v(r.impressions) > 0 ? (v(r.revenue) / v(r.impressions)) * 1000 : 0,
    fillRate: v(r.bid_requests) > 0 ? (v(r.impressions) / v(r.bid_requests)) * 100 : 0,
    timeoutRate: v(r.bid_requests) > 0 ? (v(r.timeouts) / v(r.bid_requests)) * 100 : 0,
  }));

  return {
    totalRevenue, totalImpressions, avgECPM, fillRate, revenueChange,
    topPartners: [...allPartners].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    worstPartners: allPartners.filter(p => p.ecpm < 1 || p.timeoutRate > 15).sort((a, b) => a.ecpm - b.ecpm).slice(0, 5),
  };
}
