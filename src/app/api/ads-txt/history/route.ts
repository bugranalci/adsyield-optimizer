import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('ads_txt_search_history')
      .select('*')
      .order('searched_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ history: data || [] });
  } catch (error) {
    console.error('[Ads-Txt History] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch search history' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const supabase = createServiceClient();

    const { error } = await supabase
      .from('ads_txt_search_history')
      .delete()
      .neq('id', 0);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Ads-Txt History] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to clear search history' },
      { status: 500 }
    );
  }
}
