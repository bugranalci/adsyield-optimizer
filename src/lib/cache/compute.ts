import { createServiceClient } from '@/lib/supabase/server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

// ─── Supabase helpers ────────────────────────────────────────────

async function fetchAllRows(supabase: ReturnType<typeof createServiceClient>, select: string, gte: string, lte: string): Promise<Row[]> {
  const PAGE_SIZE = 1000;
  let all: Row[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.from('limelight_stats').select(select)
      .gte('date', gte).lte('date', lte).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

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

// ─── Date helpers ────────────────────────────────────────────────

function fmt(d: Date): string { return d.toISOString().split('T')[0]; }
function calcChange(curr: number, prev: number): number { return prev > 0 ? ((curr - prev) / prev) * 100 : 0; }
function daysAgo(n: number): Date { const d = new Date(); d.setDate(d.getDate() - n); return d; }

// ─── Main refresh function ──────────────────────────────────────

const ALL_COLS = 'date,demand_partner_name,supply_partner_name,publisher,bundle,ad_unit_type,os,country,impressions,demand_payout,pub_payout,bid_requests,bids,wins,opportunities,bid_response_timeouts,bid_response_errors,demand_service_fee';

export async function refreshAllCaches() {
  const supabase = createServiceClient();
  console.log('[Cache] Starting full cache refresh...');

  const today = fmt(new Date());
  const start7 = fmt(daysAgo(7));
  const prevStart = fmt(daysAgo(14));
  const prevEnd = fmt(daysAgo(7));

  const [currentData, prevData] = await Promise.all([
    fetchAllRows(supabase, ALL_COLS, start7, today),
    fetchAllRows(supabase, ALL_COLS, prevStart, prevEnd),
  ]);

  console.log(`[Cache] Fetched ${currentData.length} current + ${prevData.length} prev rows`);

  await saveCache(supabase, 'dashboard', computeDashboard(currentData, prevData));
  await saveCache(supabase, 'bundles_7', computeBundles(currentData));
  await saveCache(supabase, 'ad_sizes_7', computeAdSizes(currentData));
  await saveCache(supabase, 'partners_7', computePartners(currentData));
  await saveCache(supabase, 'quality_7', computeQuality(currentData, prevData));
  await saveCache(supabase, 'demand_appetite_7', computeDemandAppetite(currentData));
  await saveCache(supabase, 'timeouts_7', computeTimeouts(currentData));
  await saveCache(supabase, 'concentration_7', computeConcentration(currentData));
  await saveCache(supabase, 'filters_7', computeFilters(currentData));
  await saveCache(supabase, 'creative_7', computeCreative(currentData));

  console.log('[Cache] All caches refreshed');
}

// ═══════════════════════════════════════════════════════════════
// COMPUTE FUNCTIONS - each matches its API endpoint exact output
// ═══════════════════════════════════════════════════════════════

function v(val: string | number | undefined): number {
  if (val === undefined || val === null || val === '') return 0;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(num) ? 0 : num;
}

// ─── DASHBOARD ──────────────────────────────────────────────────

function computeDashboard(current: Row[], prev: Row[]) {
  const totalRevenue = current.reduce((s, r) => s + v(r.demand_payout), 0);
  const totalImpressions = current.reduce((s, r) => s + v(r.impressions), 0);
  const totalBidRequests = current.reduce((s, r) => s + v(r.bid_requests), 0);
  const avgECPM = totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0;
  const fillRate = totalBidRequests > 0 ? (totalImpressions / totalBidRequests) * 100 : 0;

  const prevRevenue = prev.reduce((s, r) => s + v(r.demand_payout), 0);
  const prevImpressions = prev.reduce((s, r) => s + v(r.impressions), 0);
  const prevBidRequests = prev.reduce((s, r) => s + v(r.bid_requests), 0);
  const prevECPM = prevImpressions > 0 ? (prevRevenue / prevImpressions) * 1000 : 0;
  const prevFillRate = prevBidRequests > 0 ? (prevImpressions / prevBidRequests) * 100 : 0;

  const pMap = new Map<string, { revenue: number; impressions: number; bidRequests: number; timeouts: number }>();
  for (const r of current) {
    const nm = r.demand_partner_name || ''; if (!nm) continue;
    const e = pMap.get(nm) || { revenue: 0, impressions: 0, bidRequests: 0, timeouts: 0 };
    e.revenue += v(r.demand_payout); e.impressions += v(r.impressions);
    e.bidRequests += v(r.bid_requests); e.timeouts += v(r.bid_response_timeouts);
    pMap.set(nm, e);
  }
  const topPartners = Array.from(pMap.entries())
    .map(([name, s]) => ({ name, revenue: s.revenue, impressions: s.impressions,
      ecpm: s.impressions > 0 ? (s.revenue / s.impressions) * 1000 : 0,
      fillRate: s.bidRequests > 0 ? (s.impressions / s.bidRequests) * 100 : 0,
      timeoutRate: s.bidRequests > 0 ? (s.timeouts / s.bidRequests) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const pubMap = new Map<string, { revenue: number; impressions: number; pubPayout: number }>();
  for (const r of current) {
    const nm = r.publisher || ''; if (!nm) continue;
    const e = pubMap.get(nm) || { revenue: 0, impressions: 0, pubPayout: 0 };
    e.revenue += v(r.demand_payout); e.impressions += v(r.impressions); e.pubPayout += v(r.pub_payout);
    pubMap.set(nm, e);
  }
  const topPublishers = Array.from(pubMap.entries())
    .map(([name, s]) => ({ name, revenue: s.revenue, impressions: s.impressions, pubPayout: s.pubPayout,
      ecpm: s.impressions > 0 ? (s.revenue / s.impressions) * 1000 : 0 }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const bMap = new Map<string, { revenue: number; impressions: number }>();
  for (const r of current) {
    const b = r.bundle || ''; if (!b) continue;
    const e = bMap.get(b) || { revenue: 0, impressions: 0 };
    e.revenue += v(r.demand_payout); e.impressions += v(r.impressions);
    bMap.set(b, e);
  }
  const topBundles = Array.from(bMap.entries()).filter(([, s]) => s.impressions > 0)
    .map(([bundle, s]) => ({ bundle, revenue: s.revenue, impressions: s.impressions }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const dMap = new Map<string, { revenue: number; impressions: number }>();
  for (const r of current) {
    const e = dMap.get(r.date) || { revenue: 0, impressions: 0 };
    e.revenue += v(r.demand_payout); e.impressions += v(r.impressions);
    dMap.set(r.date, e);
  }
  const dailyTrend = Array.from(dMap.entries())
    .map(([date, s]) => ({ date, revenue: s.revenue, impressions: s.impressions }))
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
  const bMap = new Map<string, { impressions: number; revenue: number; bidRequests: number; bids: number; wins: number; opportunities: number; timeouts: number; errors: number; pubPayout: number }>();
  for (const r of data) {
    const b = r.bundle || ''; if (!b) continue;
    const e = bMap.get(b) || { impressions: 0, revenue: 0, bidRequests: 0, bids: 0, wins: 0, opportunities: 0, timeouts: 0, errors: 0, pubPayout: 0 };
    e.impressions += v(r.impressions); e.revenue += v(r.demand_payout); e.bidRequests += v(r.bid_requests);
    e.bids += v(r.bids); e.wins += v(r.wins); e.opportunities += v(r.opportunities);
    e.timeouts += v(r.bid_response_timeouts); e.errors += v(r.bid_response_errors); e.pubPayout += v(r.pub_payout);
    bMap.set(b, e);
  }
  const bundles = Array.from(bMap.entries()).filter(([, b]) => b.impressions > 0)
    .map(([bundle, b]) => ({ bundle, ...b,
      ecpm: b.impressions > 0 ? (b.revenue / b.impressions) * 1000 : 0,
      fillRate: b.bidRequests > 0 ? (b.impressions / b.bidRequests) * 100 : 0,
      bidRate: b.bidRequests > 0 ? (b.bids / b.bidRequests) * 100 : 0,
      winRate: b.bids > 0 ? (b.wins / b.bids) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 100);
  const totalRevenue = bundles.reduce((s, b) => s + b.revenue, 0);
  const totalImpressions = bundles.reduce((s, b) => s + b.impressions, 0);
  const totalBidRequests = bundles.reduce((s, b) => s + b.bidRequests, 0);
  return { bundles,
    summary: { totalBundles: bundles.length, totalRevenue, totalImpressions,
      avgECPM: totalImpressions > 0 ? (totalRevenue / totalImpressions) * 1000 : 0,
      overallFillRate: totalBidRequests > 0 ? (totalImpressions / totalBidRequests) * 100 : 0 },
    period: 7 };
}

// ─── AD SIZES ───────────────────────────────────────────────────

function computeAdSizes(data: Row[]) {
  const sMap = new Map<string, { impressions: number; revenue: number; bidRequests: number; bids: number; wins: number }>();
  for (const r of data) {
    const s = r.ad_unit_type || ''; if (!s) continue;
    const e = sMap.get(s) || { impressions: 0, revenue: 0, bidRequests: 0, bids: 0, wins: 0 };
    e.impressions += v(r.impressions); e.revenue += v(r.demand_payout);
    e.bidRequests += v(r.bid_requests); e.bids += v(r.bids); e.wins += v(r.wins);
    sMap.set(s, e);
  }
  const sizes = Array.from(sMap.entries()).filter(([, s]) => s.impressions > 0)
    .map(([size, s]) => ({ size, impressions: s.impressions,
      revenue: Math.round(s.revenue * 100) / 100, bidRequests: s.bidRequests, bids: s.bids, wins: s.wins,
      eCPM: s.impressions > 0 ? Math.round((s.revenue / s.impressions) * 1000 * 100) / 100 : 0,
      fillRate: s.bidRequests > 0 ? Math.round((s.impressions / s.bidRequests) * 100 * 100) / 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 50);
  const totalRevenue = sizes.reduce((s, x) => s + x.revenue, 0);
  const totalImpressions = sizes.reduce((s, x) => s + x.impressions, 0);
  return { period: 7, totalSizes: sizes.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100, totalImpressions,
    avgECPM: totalImpressions > 0 ? Math.round((totalRevenue / totalImpressions) * 1000 * 100) / 100 : 0, sizes };
}

// ─── PARTNERS ───────────────────────────────────────────────────

function computePartners(data: Row[]) {
  type PAgg = { revenue: number; impressions: number; bidRequests: number; bids: number; wins: number; timeouts: number; errors: number };
  type PubAgg = PAgg & { pubPayout: number };
  const partnerMap = new Map<string, PAgg>();
  const publisherMap = new Map<string, PubAgg>();
  const crossMap = new Map<string, PAgg & { demandPartner: string; publisher: string }>();

  for (const r of data) {
    const partner = r.demand_partner_name || 'Unknown';
    const publisher = r.publisher || 'Unknown';
    const imp = v(r.impressions), rev = v(r.demand_payout), pp = v(r.pub_payout);
    const br = v(r.bid_requests), bi = v(r.bids), wi = v(r.wins);
    const to = v(r.bid_response_timeouts), er = v(r.bid_response_errors);

    const pe = partnerMap.get(partner) || { revenue: 0, impressions: 0, bidRequests: 0, bids: 0, wins: 0, timeouts: 0, errors: 0 };
    pe.revenue += rev; pe.impressions += imp; pe.bidRequests += br; pe.bids += bi; pe.wins += wi; pe.timeouts += to; pe.errors += er;
    partnerMap.set(partner, pe);

    const pu = publisherMap.get(publisher) || { revenue: 0, impressions: 0, bidRequests: 0, bids: 0, wins: 0, timeouts: 0, errors: 0, pubPayout: 0 };
    pu.revenue += rev; pu.impressions += imp; pu.bidRequests += br; pu.bids += bi; pu.wins += wi; pu.timeouts += to; pu.errors += er; pu.pubPayout += pp;
    publisherMap.set(publisher, pu);

    const ck = `${partner}|||${publisher}`;
    const ce = crossMap.get(ck) || { demandPartner: partner, publisher, revenue: 0, impressions: 0, bidRequests: 0, bids: 0, wins: 0, timeouts: 0, errors: 0 };
    ce.revenue += rev; ce.impressions += imp; ce.bidRequests += br; ce.bids += bi; ce.wins += wi; ce.timeouts += to; ce.errors += er;
    crossMap.set(ck, ce);
  }

  const buildPartner = (name: string, a: PAgg) => ({ name, ...a,
    ecpm: a.impressions > 0 ? (a.revenue / a.impressions) * 1000 : 0,
    fillRate: a.bidRequests > 0 ? (a.impressions / a.bidRequests) * 100 : 0,
    timeoutRate: a.bidRequests > 0 ? (a.timeouts / a.bidRequests) * 100 : 0 });

  const buildPublisher = (name: string, a: PubAgg) => ({ name, ...a,
    ecpm: a.impressions > 0 ? (a.revenue / a.impressions) * 1000 : 0,
    fillRate: a.bidRequests > 0 ? (a.impressions / a.bidRequests) * 100 : 0,
    timeoutRate: a.bidRequests > 0 ? (a.timeouts / a.bidRequests) * 100 : 0 });

  return {
    period: 7,
    demandPartners: Array.from(partnerMap.entries()).map(([n, a]) => buildPartner(n, a)).sort((a, b) => b.revenue - a.revenue),
    publishers: Array.from(publisherMap.entries()).map(([n, a]) => buildPublisher(n, a)).sort((a, b) => b.revenue - a.revenue),
    crossReference: Array.from(crossMap.values())
      .map(e => ({ demandPartner: e.demandPartner, publisher: e.publisher, revenue: e.revenue, impressions: e.impressions, bidRequests: e.bidRequests,
        ecpm: e.impressions > 0 ? (e.revenue / e.impressions) * 1000 : 0,
        fillRate: e.bidRequests > 0 ? (e.impressions / e.bidRequests) * 100 : 0,
        timeoutRate: e.bidRequests > 0 ? (e.timeouts / e.bidRequests) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue),
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

function computeQuality(current: Row[], prev: Row[]) {
  type Agg = { revenue: number; impressions: number; bidRequests: number; bids: number; wins: number; timeouts: number };
  const aggPub = (rows: Row[]) => {
    const m = new Map<string, Agg>();
    for (const r of rows) {
      const pub = r.publisher || 'Unknown';
      const e = m.get(pub) || { revenue: 0, impressions: 0, bidRequests: 0, bids: 0, wins: 0, timeouts: 0 };
      e.revenue += v(r.demand_payout); e.impressions += v(r.impressions); e.bidRequests += v(r.bid_requests);
      e.bids += v(r.bids); e.wins += v(r.wins); e.timeouts += v(r.bid_response_timeouts);
      m.set(pub, e);
    }
    return m;
  };

  const currentMap = aggPub(current);
  const prevMap = aggPub(prev);

  const publishers = Array.from(currentMap.entries()).map(([name, a]) => {
    const qs = qScore(a);
    const prevAgg = prevMap.get(name);
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (prevAgg) { const diff = qs - qScore(prevAgg); if (diff > 3) trend = 'improving'; else if (diff < -3) trend = 'declining'; }
    return {
      publisher: name, qualityScore: Math.round(qs * 10) / 10,
      bidRate: a.bidRequests > 0 ? Math.round((a.bids / a.bidRequests) * 100 * 100) / 100 : 0,
      winRate: a.bids > 0 ? Math.round((a.wins / a.bids) * 100 * 100) / 100 : 0,
      fillRate: a.bidRequests > 0 ? Math.round((a.impressions / a.bidRequests) * 100 * 100) / 100 : 0,
      revenue: a.revenue, impressions: a.impressions, bidRequests: a.bidRequests, timeouts: a.timeouts, trend,
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

function computeDemandAppetite(data: Row[]) {
  type Agg = { revenue: number; impressions: number; bidRequests: number; bids: number; wins: number; opportunities: number; timeouts: number; errors: number; publishers: Map<string, { revenue: number; impressions: number }> };
  const pMap = new Map<string, Agg>();

  for (const r of data) {
    const partner = r.demand_partner_name || 'Unknown';
    const publisher = r.publisher || 'Unknown';
    if (!partner || partner === '') continue;
    const e = pMap.get(partner) || { revenue: 0, impressions: 0, bidRequests: 0, bids: 0, wins: 0, opportunities: 0, timeouts: 0, errors: 0, publishers: new Map() };
    e.revenue += v(r.demand_payout); e.impressions += v(r.impressions); e.bidRequests += v(r.bid_requests);
    e.bids += v(r.bids); e.wins += v(r.wins); e.opportunities += v(r.opportunities);
    e.timeouts += v(r.bid_response_timeouts); e.errors += v(r.bid_response_errors);
    if (publisher && publisher !== '' && publisher !== 'Unknown') {
      const pe = e.publishers.get(publisher) || { revenue: 0, impressions: 0 };
      pe.revenue += v(r.demand_payout); pe.impressions += v(r.impressions);
      e.publishers.set(publisher, pe);
    }
    pMap.set(partner, e);
  }

  const demandPartners = Array.from(pMap.entries())
    .map(([name, a]) => ({
      name, revenue: a.revenue, impressions: a.impressions, bidRequests: a.bidRequests,
      bids: a.bids, wins: a.wins, opportunities: a.opportunities,
      winRate: a.bids > 0 ? (a.wins / a.bids) * 100 : 0,
      bidRate: a.bidRequests > 0 ? (a.bids / a.bidRequests) * 100 : 0,
      avgBidPrice: a.impressions > 0 ? a.revenue / a.impressions : 0,
      timeoutRate: a.bidRequests > 0 ? (a.timeouts / a.bidRequests) * 100 : 0,
      fillRate: a.bidRequests > 0 ? (a.impressions / a.bidRequests) * 100 : 0,
      topPublishers: Array.from(a.publishers.entries())
        .map(([pn, ps]) => ({ name: pn, revenue: ps.revenue, impressions: ps.impressions }))
        .sort((x, y) => y.revenue - x.revenue).slice(0, 5),
    })).sort((a, b) => b.revenue - a.revenue).slice(0, 30);

  const totalPartners = demandPartners.length;
  const avgWinRate = totalPartners > 0 ? demandPartners.reduce((s, p) => s + p.winRate, 0) / totalPartners : 0;
  const highestBidder = demandPartners.length > 0 ? demandPartners.reduce((max, p) => p.avgBidPrice > max.avgBidPrice ? p : max, demandPartners[0]) : null;

  return {
    period: 7,
    summary: { totalPartners, avgWinRate,
      highestBidder: highestBidder ? { name: highestBidder.name, avgBidPrice: highestBidder.avgBidPrice } : null,
      totalRevenue: demandPartners.reduce((s, p) => s + p.revenue, 0),
      totalImpressions: demandPartners.reduce((s, p) => s + p.impressions, 0) },
    demandPartners,
  };
}

// ─── TIMEOUTS ───────────────────────────────────────────────────

function computeTimeouts(data: Row[]) {
  const totalImp = data.reduce((s, r) => s + v(r.impressions), 0);
  const totalRev = data.reduce((s, r) => s + v(r.demand_payout), 0);
  const averageEcpm = totalImp > 0 ? (totalRev / totalImp) * 1000 : 0;

  const pMap = new Map<string, { totalRequests: number; timeouts: number; errors: number; impressions: number; revenue: number }>();
  for (const r of data) {
    const nm = r.demand_partner_name || 'Unknown'; if (!nm || nm === '') continue;
    const e = pMap.get(nm) || { totalRequests: 0, timeouts: 0, errors: 0, impressions: 0, revenue: 0 };
    e.totalRequests += v(r.bid_requests); e.timeouts += v(r.bid_response_timeouts);
    e.errors += v(r.bid_response_errors); e.impressions += v(r.impressions); e.revenue += v(r.demand_payout);
    pMap.set(nm, e);
  }

  const partners = Array.from(pMap.entries()).filter(([, s]) => s.totalRequests > 0)
    .map(([name, s]) => ({ name, ...s,
      timeoutRate: s.totalRequests > 0 ? (s.timeouts / s.totalRequests) * 100 : 0,
      errorRate: s.totalRequests > 0 ? (s.errors / s.totalRequests) * 100 : 0,
      estimatedRevenueLoss: (s.timeouts * averageEcpm) / 1000 }))
    .sort((a, b) => b.timeoutRate - a.timeoutRate);

  const dMap = new Map<string, { totalTimeouts: number; totalRequests: number; totalErrors: number }>();
  for (const r of data) {
    const e = dMap.get(r.date) || { totalTimeouts: 0, totalRequests: 0, totalErrors: 0 };
    e.totalTimeouts += v(r.bid_response_timeouts); e.totalRequests += v(r.bid_requests); e.totalErrors += v(r.bid_response_errors);
    dMap.set(r.date, e);
  }
  const dailyTrend = Array.from(dMap.entries())
    .map(([date, s]) => ({ date, ...s, timeoutRate: s.totalRequests > 0 ? (s.totalTimeouts / s.totalRequests) * 100 : 0 }))
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

function computeConcentration(data: Row[]) {
  const demandMap = new Map<string, number>();
  const publisherMap = new Map<string, number>();
  let totalDR = 0, totalPR = 0;

  for (const r of data) {
    const rev = v(r.demand_payout);
    demandMap.set(r.demand_partner_name || 'Unknown', (demandMap.get(r.demand_partner_name || 'Unknown') || 0) + rev);
    publisherMap.set(r.publisher || 'Unknown', (publisherMap.get(r.publisher || 'Unknown') || 0) + rev);
    totalDR += rev; totalPR += rev;
  }

  const conc = (map: Map<string, number>, total: number) => {
    const dist = Array.from(map.entries()).map(([name, revenue]) => ({ name, revenue, share: total > 0 ? (revenue / total) * 100 : 0 })).sort((a, b) => b.revenue - a.revenue);
    const hhi = dist.reduce((s, e) => s + e.share * e.share, 0);
    return { distribution: dist, top5Share: Math.round(dist.slice(0, 5).reduce((s, e) => s + e.share, 0) * 100) / 100,
      top10Share: Math.round(dist.slice(0, 10).reduce((s, e) => s + e.share, 0) * 100) / 100, hhi: Math.round(hhi), count: dist.length };
  };
  const risk = (hhi: number): 'low' | 'medium' | 'high' => hhi < 1500 ? 'low' : hhi <= 2500 ? 'medium' : 'high';

  const demand = conc(demandMap, totalDR);
  const publisher = conc(publisherMap, totalPR);
  const dr = risk(demand.hhi), pr = risk(publisher.hhi);
  const ro = { low: 0, medium: 1, high: 2 };

  return {
    demand: { hhi: demand.hhi, top5Share: demand.top5Share, top10Share: demand.top10Share, risk: dr, count: demand.count, distribution: demand.distribution },
    publisher: { hhi: publisher.hhi, top5Share: publisher.top5Share, top10Share: publisher.top10Share, risk: pr, count: publisher.count, distribution: publisher.distribution },
    overallRisk: ro[dr] >= ro[pr] ? dr : pr, totalRevenue: totalDR,
  };
}

// ─── FILTERS ────────────────────────────────────────────────────

function computeFilters(data: Row[]) {
  const totalImp = data.reduce((s, r) => s + v(r.impressions), 0);
  const totalRev = data.reduce((s, r) => s + v(r.demand_payout), 0);
  const averageEcpm = totalImp > 0 ? (totalRev / totalImp) * 1000 : 0;

  const pMap = new Map<string, { bidRequests: number; bids: number; wins: number; impressions: number; timeouts: number; errors: number; revenue: number }>();
  for (const r of data) {
    const partner = r.demand_partner_name || 'Unknown';
    const e = pMap.get(partner) || { bidRequests: 0, bids: 0, wins: 0, impressions: 0, timeouts: 0, errors: 0, revenue: 0 };
    e.bidRequests += v(r.bid_requests); e.bids += v(r.bids); e.wins += v(r.wins);
    e.impressions += v(r.impressions); e.timeouts += v(r.bid_response_timeouts);
    e.errors += v(r.bid_response_errors); e.revenue += v(r.demand_payout);
    pMap.set(partner, e);
  }

  const partners = Array.from(pMap.entries()).filter(([, s]) => s.bidRequests > 0)
    .map(([name, s]) => {
      const lossRate = s.bids > 0 ? (1 - s.impressions / s.bids) * 100 : 0;
      const lostBids = Math.max(0, s.bids - s.impressions);
      return { name, ...s, lossRate: Math.max(0, lossRate),
        timeoutRate: s.bidRequests > 0 ? (s.timeouts / s.bidRequests) * 100 : 0,
        bidResponseRate: s.bidRequests > 0 ? (s.bids / s.bidRequests) * 100 : 0,
        fillRate: s.bidRequests > 0 ? (s.impressions / s.bidRequests) * 100 : 0,
        timeoutRevenueLoss: (s.timeouts * averageEcpm) / 1000,
        lostBids, lostBidRevenue: (lostBids * averageEcpm) / 1000 };
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

function computeCreative(data: Row[]) {
  const pMap = new Map<string, { impressions: number; bids: number; wins: number; revenue: number; bidRequests: number; opportunities: number }>();
  for (const r of data) {
    const partner = r.demand_partner_name || 'Unknown';
    const e = pMap.get(partner) || { impressions: 0, bids: 0, wins: 0, revenue: 0, bidRequests: 0, opportunities: 0 };
    e.impressions += v(r.impressions); e.bids += v(r.bids); e.wins += v(r.wins);
    e.revenue += v(r.demand_payout); e.bidRequests += v(r.bid_requests); e.opportunities += v(r.opportunities);
    pMap.set(partner, e);
  }

  const partners = Array.from(pMap.entries()).filter(([, s]) => s.bids > 0 || s.impressions > 0)
    .map(([name, s]) => ({ name, ...s,
      winRate: s.bids > 0 ? (s.wins / s.bids) * 100 : 0,
      renderRate: s.wins > 0 ? (s.impressions / s.wins) * 100 : 0,
      ecpm: s.impressions > 0 ? (s.revenue / s.impressions) * 1000 : 0,
      bidRate: s.bidRequests > 0 ? (s.bids / s.bidRequests) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  const tI = partners.reduce((s, p) => s + p.impressions, 0);
  const tB = partners.reduce((s, p) => s + p.bids, 0);
  const tW = partners.reduce((s, p) => s + p.wins, 0);
  const tR = partners.reduce((s, p) => s + p.revenue, 0);
  const tBR = partners.reduce((s, p) => s + p.bidRequests, 0);

  const dMap = new Map<string, { impressions: number; wins: number; revenue: number }>();
  for (const r of data) {
    const e = dMap.get(r.date) || { impressions: 0, wins: 0, revenue: 0 };
    e.impressions += v(r.impressions); e.wins += v(r.wins); e.revenue += v(r.demand_payout);
    dMap.set(r.date, e);
  }
  const dailyTrend = Array.from(dMap.entries()).map(([date, s]) => ({ date, ...s })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    summary: { totalImpressions: tI, totalBids: tB, totalWins: tW, totalRevenue: tR, totalBidRequests: tBR,
      overallWinRate: tB > 0 ? (tW / tB) * 100 : 0, overallEcpm: tI > 0 ? (tR / tI) * 1000 : 0,
      overallBidRate: tBR > 0 ? (tB / tBR) * 100 : 0 },
    partners, dailyTrend, period: 7,
  };
}
