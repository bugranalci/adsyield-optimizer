import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { DEFAULT_PUBLISHERS, extractDomain } from '@/lib/app-ads-txt/default-publishers';

export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('publisher_domains')
      .select('*')
      .order('domain', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ publishers: data || [] });
  } catch (error) {
    console.error('[App-Ads-Txt Publishers] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch publishers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const body = await request.json();

    // Case 1: Reset to defaults
    if (body.action === 'reset_defaults') {
      // Delete all existing publishers
      const { error: deleteError } = await supabase
        .from('publisher_domains')
        .delete()
        .neq('id', 0); // Delete all rows

      if (deleteError) throw deleteError;

      // Insert all defaults
      const rows = DEFAULT_PUBLISHERS.map((url) => ({
        domain: extractDomain(url),
        url,
        status: 'active' as const,
      }));

      const { error: insertError } = await supabase
        .from('publisher_domains')
        .upsert(rows, { onConflict: 'url' });

      if (insertError) throw insertError;

      return NextResponse.json({
        success: true,
        message: `Reset to ${DEFAULT_PUBLISHERS.length} default publishers`,
        count: DEFAULT_PUBLISHERS.length,
      });
    }

    // Case 2: Bulk add URLs
    if (body.urls && Array.isArray(body.urls)) {
      const rows = body.urls.map((url: string) => ({
        domain: extractDomain(url),
        url,
        status: 'active' as const,
      }));

      const { data, error } = await supabase
        .from('publisher_domains')
        .upsert(rows, { onConflict: 'url' })
        .select();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: `Added ${rows.length} publishers`,
        publishers: data || [],
      }, { status: 201 });
    }

    // Case 3: Add single URL
    if (body.url && typeof body.url === 'string') {
      const { data, error } = await supabase
        .from('publisher_domains')
        .upsert(
          {
            domain: extractDomain(body.url),
            url: body.url,
            status: 'active' as const,
          },
          { onConflict: 'url' }
        )
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({ success: true, publisher: data }, { status: 201 });
    }

    return NextResponse.json(
      { error: 'Invalid request body. Provide url, urls, or action.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[App-Ads-Txt Publishers] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to add publisher(s)' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json(
        { error: 'url query parameter is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('publisher_domains')
      .delete()
      .eq('url', url);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[App-Ads-Txt Publishers] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete publisher' },
      { status: 500 }
    );
  }
}
