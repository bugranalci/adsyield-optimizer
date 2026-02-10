import { LimelightAPIResponse } from '@/types';

export interface TransformedRow {
  date: string;
  demand_partner_name: string;
  supply_partner_name: string;
  publisher: string;
  bundle: string;
  ad_unit_type: string;
  channel_type: string;
  os: string;
  country: string;
  opportunities: number;
  bid_requests: number;
  bids: number;
  wins: number;
  impressions: number;
  pub_payout: number;
  demand_payout: number;
  demand_service_fee: number;
  bid_response_timeouts: number;
  bid_response_errors: number;
}

/**
 * Transform Limelight API response into database-ready rows.
 *
 * API field names (from actual API testing):
 * - DEMAND dimension: DEMAND_ID, DEMAND_NAME
 * - PUBLISHER dimension: PUBLISHER_ID, PUBLISHER_NAME
 * - BUNDLE dimension: BUNDLE
 * - OS dimension: OS
 * - COUNTRY dimension: COUNTRY
 * - SIZE dimension: SIZE
 * - CHANNEL_TYPE dimension: CHANNEL_TYPE
 *
 * All unique constraint columns use '' instead of null to avoid
 * PostgreSQL NULL != NULL issue in UNIQUE constraints.
 */
export function transformLimelightResponse(rows: LimelightAPIResponse[]): TransformedRow[] {
  return rows
    .filter((row) => row.DATE)
    .map((row) => ({
      date: row.DATE!,
      // DEMAND dimension returns DEMAND_NAME
      demand_partner_name: row.DEMAND_NAME || row.DEMAND_PARTNER_NAME || '',
      // No separate supply partner in API - publisher is the supply side
      supply_partner_name: '',
      // PUBLISHER dimension returns PUBLISHER_NAME
      publisher: row.PUBLISHER_NAME || row.PUBLISHER || '',
      // BUNDLE dimension returns BUNDLE
      bundle: row.BUNDLE || row.SUPPLY_SOURCE || '',
      // SIZE dimension returns SIZE (maps to ad_unit_type)
      ad_unit_type: row.SIZE || row.AD_UNIT_TYPE || row.AD_UNIT || '',
      // CHANNEL_TYPE dimension returns CHANNEL_TYPE
      channel_type: row.CHANNEL_TYPE || '',
      // OS dimension
      os: row.OS || '',
      // COUNTRY dimension
      country: row.COUNTRY || '',
      // Metrics
      opportunities: toNumber(row.OPPORTUNITIES),
      bid_requests: toNumber(row.BID_REQUESTS),
      bids: toNumber(row.BIDS),
      wins: toNumber(row.WINS),
      impressions: toNumber(row.IMPRESSIONS),
      pub_payout: toDecimal(row.PUB_PAYOUT),
      demand_payout: toDecimal(row.DEMAND_PAYOUT),
      demand_service_fee: toDecimal(row.DEMAND_SERVICE_FEE_PAYOUT),
      bid_response_timeouts: toNumber(row.BID_RESPONSE_TIMEOUTS),
      bid_response_errors: toNumber(row.BID_RESPONSE_ERRORS),
    }));
}

function toNumber(val: string | number | undefined): number {
  if (val === undefined || val === null || val === '') return 0;
  const n = typeof val === 'string' ? parseInt(val, 10) : Math.round(val);
  return isNaN(n) ? 0 : n;
}

function toDecimal(val: string | number | undefined): number {
  if (val === undefined || val === null || val === '') return 0;
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(n) ? 0 : Math.round(n * 10000) / 10000; // 4 decimal places
}
