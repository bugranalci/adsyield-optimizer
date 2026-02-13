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

  const today = fmt(new Date());
  const start7 = fmt(daysAgo(7));
  const prevStart = fmt(daysAgo(14));
  const prevEnd = fmt(daysAgo(7));

  // Helper to run a single RPC call with error checking
  async function rpc(fn: string, params: Record<string, string>): Promise<Row[]> {
    const { data, error } = await supabase.rpc(fn, params);
    if (error) throw new Error(`RPC ${fn} error: ${error.message}`);
    return (data || []) as Row[];
  }

  // Run queries sequentially to avoid overwhelming the DB
  // Batch 1: current period core queries
  const partners = await rpc('agg_by_demand_partner', { p_start: start7, p_end: today });
  const publishers = await rpc('agg_by_publisher', { p_start: start7, p_end: today });
  const dates = await rpc('agg_by_date', { p_start: start7, p_end: today });
  console.log(`[Cache] Batch 1 done: ${partners.length} partners, ${publishers.length} publishers, ${dates.length} dates`);

  // Batch 2: current period extra queries
  const bundles = await rpc('agg_by_bundle', { p_start: start7, p_end: today });
  const adTypes = await rpc('agg_by_ad_unit_type', { p_start: start7, p_end: today });
  const cross = await rpc('agg_by_demand_publisher', { p_start: start7, p_end: today });
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
