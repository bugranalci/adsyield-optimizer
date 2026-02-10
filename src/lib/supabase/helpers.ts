import { createServiceClient } from './server';

// Fetch all rows from a Supabase table with automatic pagination
// Supabase default max_rows is 1000, so we paginate in chunks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllRows(
  table: string,
  select: string,
  filters: {
    gte?: [string, string];
    lte?: [string, string];
    eq?: [string, string];
    gt?: [string, string | number];
    neq?: [string, string];
  } = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const supabase = createServiceClient();
  const PAGE_SIZE = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allData: any[] = [];
  let offset = 0;

  while (true) {
    let query = supabase.from(table).select(select).range(offset, offset + PAGE_SIZE - 1);
    if (filters.gte) query = query.gte(filters.gte[0], filters.gte[1]);
    if (filters.lte) query = query.lte(filters.lte[0], filters.lte[1]);
    if (filters.eq) query = query.eq(filters.eq[0], filters.eq[1]);
    if (filters.gt) query = query.gt(filters.gt[0], filters.gt[1]);
    if (filters.neq) query = query.neq(filters.neq[0], filters.neq[1]);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allData;
}

// Get date strings for time periods
export function getDateRanges() {
  const now = new Date();
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  const today = formatDate(now);

  const d7 = new Date(now);
  d7.setDate(d7.getDate() - 7);
  const last7Start = formatDate(d7);

  const d14 = new Date(now);
  d14.setDate(d14.getDate() - 14);
  const last14Start = formatDate(d14);

  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const last30Start = formatDate(d30);

  return { today, last7Start, last14Start, last30Start };
}
