import { NextResponse, NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchLimelightStats, getYesterdayDate, getDateRange, SYNC_DIMENSIONS } from '@/lib/limelight/client';
import { transformLimelightResponse } from '@/lib/limelight/transformer';

// Allow up to 300s for sync (Vercel Pro max)
export const maxDuration = 300;

// Safety margin: stop processing 10s before maxDuration to flush results
const SAFE_TIMEOUT_MS = 280_000;


// POST - Manual sync (from UI "Sync Now" button)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { startDate, endDate, fullSync } = body;

    let syncStart: string;
    let syncEnd: string;

    if (fullSync) {
      // Full sync: last 30 days
      const range = getDateRange(30);
      syncStart = range.startDate;
      syncEnd = range.endDate;
    } else if (startDate && endDate) {
      syncStart = startDate;
      syncEnd = endDate;
    } else {
      // Default: yesterday
      syncStart = getYesterdayDate();
      syncEnd = getYesterdayDate();
    }

    const result = await performSync(syncStart, syncEnd);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    console.error('Limelight sync POST error:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// GET - Cron job sync (Vercel Cron)
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret if configured
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Sync yesterday's data
    const yesterday = getYesterdayDate();
    const result = await performSync(yesterday, yesterday);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    console.error('Limelight sync GET error:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * Generate array of date strings between start and end (inclusive).
 */
function getDatesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Sync a single day's data from Limelight.
 */
async function syncSingleDay(
  supabase: ReturnType<typeof createServiceClient>,
  day: string
): Promise<{ synced: number; errors: number }> {
  const rawData = await fetchLimelightStats({
    startDate: day,
    endDate: day,
    dimensions: SYNC_DIMENSIONS,
  });

  const transformed = transformLimelightResponse(rawData);
  if (transformed.length === 0) {
    return { synced: 0, errors: 0 };
  }

  const BATCH_SIZE = 500;
  let synced = 0;
  let errors = 0;

  for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
    const batch = transformed.slice(i, i + BATCH_SIZE);

    const { error: upsertError } = await supabase
      .from('limelight_stats')
      .upsert(batch, {
        onConflict: 'date,demand_partner_name,supply_partner_name,publisher,bundle,ad_unit_type,os,country',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error(`[Sync] Upsert error on ${day}:`, upsertError.message);
      errors++;
      continue;
    }

    synced += batch.length;
  }

  return { synced, errors };
}

async function performSync(startDate: string, endDate: string) {
  const supabase = createServiceClient();
  const functionStart = Date.now();

  // Log sync start
  const { data: syncLog } = await supabase
    .from('sync_logs')
    .insert({
      sync_type: 'limelight',
      start_date: startDate,
      end_date: endDate,
      status: 'running',
    })
    .select()
    .single();

  try {
    // Process day-by-day to avoid timeouts from large BUNDLE dimension data
    const days = getDatesBetween(startDate, endDate);
    console.log(`[Sync] Starting: ${startDate} to ${endDate} (${days.length} days)`);

    let totalSynced = 0;
    let totalErrors = 0;
    let daysProcessed = 0;
    let timedOut = false;

    for (const day of days) {
      // Safety check: bail out before Vercel function timeout
      if (Date.now() - functionStart > SAFE_TIMEOUT_MS) {
        console.warn(`[Sync] Approaching timeout after ${daysProcessed} days. Stopping gracefully.`);
        timedOut = true;
        break;
      }

      console.log(`[Sync] Processing ${day}...`);
      const result = await syncSingleDay(supabase, day);
      totalSynced += result.synced;
      totalErrors += result.errors;
      daysProcessed++;
      console.log(`[Sync] ${day}: ${result.synced} rows synced`);
    }

    const durationMs = Date.now() - functionStart;
    console.log(`[Sync] Done: ${totalSynced} rows synced, ${totalErrors} errors, ${daysProcessed}/${days.length} days in ${durationMs}ms`);

    // Update sync log
    if (syncLog) {
      await supabase
        .from('sync_logs')
        .update({
          rows_synced: totalSynced,
          status: timedOut ? 'completed' : 'completed',
          error_message: timedOut
            ? `Processed ${daysProcessed}/${days.length} days before timeout. Re-run to continue.`
            : totalErrors > 0 ? `${totalErrors} batch(es) had errors` : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLog.id);
    }

    return {
      success: true,
      rowsSynced: totalSynced,
      daysProcessed,
      totalDays: days.length,
      errors: totalErrors,
      timedOut,
      durationMs,
      dateRange: { startDate, endDate },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Sync] Fatal error:', message);

    if (syncLog) {
      await supabase
        .from('sync_logs')
        .update({
          status: 'failed',
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLog.id);
    }

    throw error;
  }
}
