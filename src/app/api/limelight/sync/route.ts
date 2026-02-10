import { NextResponse, NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchLimelightStats, getYesterdayDate, getDateRange, SYNC_DIMENSIONS } from '@/lib/limelight/client';
import { transformLimelightResponse } from '@/lib/limelight/transformer';

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

async function performSync(startDate: string, endDate: string) {
  const supabase = createServiceClient();

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
    // Fetch from Limelight API using core sync dimensions (DATE, DEMAND, PUBLISHER)
    console.log(`[Sync] Starting: ${startDate} to ${endDate}`);
    const rawData = await fetchLimelightStats({
      startDate,
      endDate,
      dimensions: SYNC_DIMENSIONS,
    });

    const transformed = transformLimelightResponse(rawData);

    if (transformed.length === 0) {
      if (syncLog) {
        await supabase
          .from('sync_logs')
          .update({
            rows_synced: 0,
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', syncLog.id);
      }

      return { success: true, rowsSynced: 0, message: 'No data returned from Limelight' };
    }

    // Upsert in batches (Supabase has row limits per request)
    const BATCH_SIZE = 500;
    let totalSynced = 0;
    let errorCount = 0;

    for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
      const batch = transformed.slice(i, i + BATCH_SIZE);

      const { error: upsertError } = await supabase
        .from('limelight_stats')
        .upsert(batch, {
          onConflict: 'date,demand_partner_name,supply_partner_name,publisher,bundle,ad_unit_type,os,country',
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error(`[Sync] Upsert batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, upsertError.message);
        errorCount++;
        continue;
      }

      totalSynced += batch.length;
    }

    console.log(`[Sync] Done: ${totalSynced} rows synced, ${errorCount} errors`);

    // Update sync log
    if (syncLog) {
      await supabase
        .from('sync_logs')
        .update({
          rows_synced: totalSynced,
          status: 'completed',
          error_message: errorCount > 0 ? `${errorCount} batch(es) had errors` : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLog.id);
    }

    return {
      success: true,
      rowsSynced: totalSynced,
      totalRows: transformed.length,
      errors: errorCount,
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
