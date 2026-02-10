import { LimelightAPIResponse } from '@/types';

const LIMELIGHT_API_URL = process.env.LIMELIGHT_API_URL || 'http://stats.project-limelight.com/v1/stats';
const CLIENT_KEY = process.env.LIMELIGHT_CLIENT_KEY || '';
const SECRET_KEY = process.env.LIMELIGHT_SECRET_KEY || '';

const ALL_DIMENSIONS = [
  'DATE',
  'DEMAND_PARTNER_NAME',
  'SUPPLY_PARTNER_NAME',
  'PUBLISHER',
  'AD_UNIT_TYPE',
  'CHANNEL_TYPE',
  'OS',
  'COUNTRY',
];

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
    dimensions = ALL_DIMENSIONS,
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

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
    // No caching for fresh data
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Limelight API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Limelight might return the data in different formats
  // Handle both array and object responses
  if (Array.isArray(data)) {
    return data;
  }

  if (data.data && Array.isArray(data.data)) {
    return data.data;
  }

  // If single object, wrap in array
  if (typeof data === 'object' && data !== null) {
    return [data];
  }

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
