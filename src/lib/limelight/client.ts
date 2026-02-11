import { LimelightAPIResponse } from '@/types';

const LIMELIGHT_API_URL = process.env.LIMELIGHT_API_URL || 'http://stats.project-limelight.com/v1/stats';
const CLIENT_KEY = process.env.LIMELIGHT_CLIENT_KEY || '';
const SECRET_KEY = process.env.LIMELIGHT_SECRET_KEY || '';

// Core dimensions for daily sync (stored in DB)
// DEMAND returns: DEMAND_ID, DEMAND_NAME
// PUBLISHER returns: PUBLISHER_ID, PUBLISHER_NAME
// BUNDLE is required for publisher → bundle resolution in IVT reports
export const SYNC_DIMENSIONS = ['DATE', 'DEMAND', 'PUBLISHER', 'BUNDLE'];

// Additional dimensions available for on-demand queries
// BUNDLE, OS, COUNTRY, SIZE, CHANNEL_TYPE
export const ON_DEMAND_DIMENSIONS = ['BUNDLE', 'OS', 'COUNTRY', 'SIZE', 'CHANNEL_TYPE'];

const ALL_METRICS = [
  'OPPORTUNITIES',
  'BID_REQUESTS',
  'BIDS',
  'WINS',
  'IMPRESSIONS',
  'PUB_PAYOUT',
  'DEMAND_PAYOUT',
  'DEMAND_SERVICE_FEE_PAYOUT',
  'BID_RESPONSE_TIMEOUTS',
  'BID_RESPONSE_ERRORS',
];

export interface FetchStatsParams {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  dimensions?: string[];
  metrics?: string[];
  output?: 'json' | 'csv' | 'xml';
}

export async function fetchLimelightStats(params: FetchStatsParams): Promise<LimelightAPIResponse[]> {
  const {
    startDate,
    endDate,
    dimensions = SYNC_DIMENSIONS,
    metrics = ALL_METRICS,
    output = 'json',
  } = params;

  const url = new URL(LIMELIGHT_API_URL);
  url.searchParams.set('clientKey', CLIENT_KEY);
  url.searchParams.set('secretKey', SECRET_KEY);
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('breakdown', dimensions.join(','));
  url.searchParams.set('metrics', metrics.join(','));
  url.searchParams.set('output', output);

  console.log(`[Limelight] Fetching: ${startDate} to ${endDate}, dimensions: ${dimensions.join(',')}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Limelight API HTTP error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Check for API-level errors
  if (data.status === 'FAILED') {
    throw new Error(`Limelight API error: ${data.body || 'Unknown error'}`);
  }

  // SUCCESS response: data is in data.body
  if (data.status === 'SUCCESS' && Array.isArray(data.body)) {
    console.log(`[Limelight] Received ${data.body.length} rows`);
    return data.body;
  }

  // Fallback: direct array
  if (Array.isArray(data)) {
    return data;
  }

  console.warn('[Limelight] Unexpected response format:', typeof data);
  return [];
}

export function formatDateForAPI(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return formatDateForAPI(yesterday);
}

export function getDateRange(daysBack: number): { startDate: string; endDate: string } {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // Yesterday
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  return {
    startDate: formatDateForAPI(startDate),
    endDate: formatDateForAPI(endDate),
  };
}
