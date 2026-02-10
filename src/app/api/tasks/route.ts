import { createServiceClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createServiceClient();

    // Fetch all tasks ordered by priority (critical first) then created_at
    const { data, error } = await supabase
      .from('optimization_tasks')
      .select('*')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Re-sort with custom priority ordering
    const priorityOrder: Record<string, number> = {
      critical: 0,
      important: 1,
      growth: 2,
    };

    const sorted = (data || []).sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 3;
      const pb = priorityOrder[b.priority] ?? 3;
      if (pa !== pb) return pa - pb;
      // Within same priority, newest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return NextResponse.json({ tasks: sorted });
  } catch (error) {
    console.error('Tasks GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const body = await request.json();

    const { title, description, type, priority, effort, estimated_revenue } = body;

    if (!title || !priority) {
      return NextResponse.json(
        { error: 'Title and priority are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('optimization_tasks')
      .insert({
        title,
        description: description || null,
        type: type || 'optimization',
        priority,
        effort: effort || null,
        estimated_revenue: estimated_revenue || null,
        status: 'todo',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ task: data }, { status: 201 });
  } catch (error) {
    console.error('Tasks POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const body = await request.json();

    const { id, status, ...otherFields } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status) {
      updateData.status = status;
    }

    // Allow updating other fields too
    if (otherFields.title !== undefined) updateData.title = otherFields.title;
    if (otherFields.description !== undefined) updateData.description = otherFields.description;
    if (otherFields.priority !== undefined) updateData.priority = otherFields.priority;
    if (otherFields.effort !== undefined) updateData.effort = otherFields.effort;
    if (otherFields.estimated_revenue !== undefined) updateData.estimated_revenue = otherFields.estimated_revenue;

    const { data, error } = await supabase
      .from('optimization_tasks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ task: data });
  } catch (error) {
    console.error('Tasks PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
}
