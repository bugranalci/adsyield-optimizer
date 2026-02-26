import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// GET - Vercel Cron trigger for cleaning up old IVT data
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Delete impressions older than 30 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    const { error } = await supabase
      .from('ivt_impressions')
      .delete()
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      console.error('IVT cleanup error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`IVT cleanup: deleted rows older than 30 days`);

    return NextResponse.json({
      success: true,
      cutoff: cutoffDate.toISOString(),
    });
  } catch (error) {
    console.error('IVT cleanup error:', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
