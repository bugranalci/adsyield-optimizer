import { createServiceClient } from '@/lib/supabase/server';
import {
  evaluateAllRules,
  FrequencyContext,
  IFA_FREQUENCY_THRESHOLD,
  IP_FREQUENCY_THRESHOLD,
} from './rules';
import type { IVTAnalysisResult, IVTImpression } from '@/types';

const BATCH_SIZE = 5000;
const UPDATE_CHUNK_SIZE = 500;
const MAX_CONCURRENT_UPDATES = 50;

/**
 * Build frequency context from Supabase RPC functions.
 * Falls back to empty maps if the SQL functions have not been created yet.
 */
async function buildFrequencyContext(
  supabase: ReturnType<typeof createServiceClient>,
  todayStart: string,
  tomorrowStart: string
): Promise<FrequencyContext> {
  const ifaCounts = new Map<string, number>();
  const ipCounts = new Map<string, number>();

  // Fetch IFA frequency
  try {
    const { data: ifaData, error: ifaError } = await supabase.rpc('get_ifa_frequency', {
      start_ts: todayStart,
      end_ts: tomorrowStart,
    });

    if (ifaError) {
      console.warn('[IVT Analyzer] get_ifa_frequency RPC failed:', ifaError.message);
    } else if (ifaData) {
      for (const row of ifaData as Array<{ ifa: string; cnt: number }>) {
        ifaCounts.set(row.ifa, Number(row.cnt));
      }
    }
  } catch (err) {
    console.warn('[IVT Analyzer] get_ifa_frequency RPC not available:', err);
  }

  // Fetch IP frequency
  try {
    const { data: ipData, error: ipError } = await supabase.rpc('get_ip_frequency', {
      start_ts: todayStart,
      end_ts: tomorrowStart,
    });

    if (ipError) {
      console.warn('[IVT Analyzer] get_ip_frequency RPC failed:', ipError.message);
    } else if (ipData) {
      for (const row of ipData as Array<{ ip: string; cnt: number }>) {
        ipCounts.set(row.ip, Number(row.cnt));
      }
    }
  } catch (err) {
    console.warn('[IVT Analyzer] get_ip_frequency RPC not available:', err);
  }

  return { ifaCounts, ipCounts };
}

/**
 * Process updates in chunks with concurrency control.
 */
async function writeUpdatesInChunks(
  supabase: ReturnType<typeof createServiceClient>,
  updates: Array<{
    id: number;
    is_suspicious: boolean;
    ivt_reasons: string[];
    ivt_score: number;
    analyzed_at: string;
  }>
): Promise<number> {
  let errorCount = 0;

  for (let i = 0; i < updates.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK_SIZE);

    // Process each chunk with limited concurrency
    for (let j = 0; j < chunk.length; j += MAX_CONCURRENT_UPDATES) {
      const batch = chunk.slice(j, j + MAX_CONCURRENT_UPDATES);

      const results = await Promise.all(
        batch.map((update) =>
          supabase
            .from('ivt_impressions')
            .update({
              is_suspicious: update.is_suspicious,
              ivt_reasons: update.ivt_reasons,
              ivt_score: update.ivt_score,
              analyzed_at: update.analyzed_at,
            })
            .eq('id', update.id)
        )
      );

      for (const result of results) {
        if (result.error) {
          errorCount++;
          console.error('[IVT Analyzer] Update error:', result.error.message);
        }
      }
    }
  }

  return errorCount;
}

/**
 * Upsert flagged IPs into ivt_ip_frequency table.
 */
async function updateIPFrequencyTable(
  supabase: ReturnType<typeof createServiceClient>,
  ipCounts: Map<string, number>,
  ipBundles: Map<string, Set<string>>,
  ipDevices: Map<string, Set<string>>
): Promise<void> {
  const now = new Date().toISOString();
  const flaggedIPs: Array<{
    ip: string;
    impression_count: number;
    unique_bundles: number;
    unique_devices: number;
    is_flagged: boolean;
    updated_at: string;
  }> = [];

  for (const [ip, count] of ipCounts.entries()) {
    if (count > IP_FREQUENCY_THRESHOLD) {
      flaggedIPs.push({
        ip,
        impression_count: count,
        unique_bundles: ipBundles.get(ip)?.size ?? 0,
        unique_devices: ipDevices.get(ip)?.size ?? 0,
        is_flagged: true,
        updated_at: now,
      });
    }
  }

  if (flaggedIPs.length === 0) return;

  // Upsert in batches
  for (let i = 0; i < flaggedIPs.length; i += UPDATE_CHUNK_SIZE) {
    const batch = flaggedIPs.slice(i, i + UPDATE_CHUNK_SIZE);

    const { error } = await supabase
      .from('ivt_ip_frequency')
      .upsert(batch, { onConflict: 'ip', ignoreDuplicates: false });

    if (error) {
      console.error('[IVT Analyzer] IP frequency upsert error:', error.message);
    }
  }
}

/**
 * Run IVT analysis on all unanalyzed impressions.
 * Processes in batches with frequency-based and row-level rules.
 */
export async function runIVTAnalysis(): Promise<IVTAnalysisResult> {
  const startTime = Date.now();
  const supabase = createServiceClient();

  // Step 1: Determine today's date range (UTC)
  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
  const tomorrowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  ).toISOString();

  // Step 2: Build frequency context via SQL RPC
  const frequencyContext = await buildFrequencyContext(supabase, todayStart, tomorrowStart);
  console.log(
    `[IVT Analyzer] Frequency context: ${frequencyContext.ifaCounts.size} IFAs, ${frequencyContext.ipCounts.size} IPs`
  );

  // Step 3: Process unanalyzed impressions in batches
  let totalAnalyzed = 0;
  let totalSuspicious = 0;
  let batchesProcessed = 0;
  let offset = 0;

  // Track IP stats for ivt_ip_frequency updates
  const ipImpressionCounts = new Map<string, number>();
  const ipBundleSets = new Map<string, Set<string>>();
  const ipDeviceSets = new Map<string, Set<string>>();

  while (true) {
    const { data: impressions, error: fetchError } = await supabase
      .from('ivt_impressions')
      .select('*')
      .is('analyzed_at', null)
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (fetchError) {
      console.error('[IVT Analyzer] Fetch error:', fetchError.message);
      break;
    }

    if (!impressions || impressions.length === 0) {
      break;
    }

    const batch = impressions as IVTImpression[];
    const analyzedAt = new Date().toISOString();

    // Step 4: Evaluate rules for each impression
    const updates: Array<{
      id: number;
      is_suspicious: boolean;
      ivt_reasons: string[];
      ivt_score: number;
      analyzed_at: string;
    }> = [];

    for (const imp of batch) {
      const result = evaluateAllRules(
        {
          ifa: imp.ifa,
          ip: imp.ip,
          user_agent: imp.user_agent,
          bundle: imp.bundle,
          device_make: imp.device_make,
          os: imp.os,
        },
        frequencyContext
      );

      updates.push({
        id: imp.id,
        is_suspicious: result.isSuspicious,
        ivt_reasons: result.reasons,
        ivt_score: Math.round(result.score * 100),
        analyzed_at: analyzedAt,
      });

      if (result.isSuspicious) {
        totalSuspicious++;
      }

      // Track IP statistics for frequency table
      if (imp.ip) {
        ipImpressionCounts.set(imp.ip, (ipImpressionCounts.get(imp.ip) ?? 0) + 1);

        if (imp.bundle) {
          if (!ipBundleSets.has(imp.ip)) {
            ipBundleSets.set(imp.ip, new Set());
          }
          ipBundleSets.get(imp.ip)!.add(imp.bundle);
        }

        const deviceKey = [imp.device_make, imp.device_model].filter(Boolean).join(' ');
        if (deviceKey) {
          if (!ipDeviceSets.has(imp.ip)) {
            ipDeviceSets.set(imp.ip, new Set());
          }
          ipDeviceSets.get(imp.ip)!.add(deviceKey);
        }
      }
    }

    // Step 5: Write updates back in chunks
    const errorCount = await writeUpdatesInChunks(supabase, updates);
    if (errorCount > 0) {
      console.warn(`[IVT Analyzer] Batch ${batchesProcessed + 1}: ${errorCount} update errors`);
    }

    totalAnalyzed += batch.length;
    batchesProcessed++;

    console.log(
      `[IVT Analyzer] Batch ${batchesProcessed}: processed ${batch.length} impressions (${totalSuspicious} suspicious so far)`
    );

    // If we got fewer than BATCH_SIZE, we've processed all unanalyzed rows
    if (batch.length < BATCH_SIZE) {
      break;
    }

    // Note: We do NOT increment offset because analyzed rows (now having analyzed_at set)
    // will no longer match the IS NULL filter. The next query will fetch the next batch.
  }

  // Step 6: Update ivt_ip_frequency for flagged IPs
  await updateIPFrequencyTable(supabase, ipImpressionCounts, ipBundleSets, ipDeviceSets);

  const durationMs = Date.now() - startTime;
  console.log(
    `[IVT Analyzer] Complete: ${totalAnalyzed} analyzed, ${totalSuspicious} suspicious, ${batchesProcessed} batches in ${durationMs}ms`
  );

  return {
    analyzedCount: totalAnalyzed,
    suspiciousCount: totalSuspicious,
    batchesProcessed,
    durationMs,
  };
}
