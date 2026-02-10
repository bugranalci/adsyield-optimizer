import { LimelightAPIResponse } from '@/types';

/**
 * Transform Limelight API response into database-ready rows.
 * Handles string-to-number conversion and null safety.
 */
export function transformLimelightResponse(rows: LimelightAPIResponse[]): Array<{
  date: string;
  demand_partner_name: string | null;
  supply_partner_name: string | null;
  publisher: string | null;
  bundle: string | null;
  ad_unit_type: string | null;
  channel_type: string | null;
  os: string | null;
  country: string | null;
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
}> {
  return rows
    .filter((row) => row.DATE) // Must have a date
    .map((row) => ({
      date: row.DATE!,
      demand_partner_name: row.DEMAND_PARTNER_NAME || row.DEMAND || null,
      supply_partner_name: row.SUPPLY_PARTNER_NAME || null,
      publisher: row.PUBLISHER || null,
      bundle: row.SUPPLY_SOURCE || null,
      ad_unit_type: row.AD_UNIT_TYPE || row.AD_UNIT || null,
      channel_type: row.CHANNEL_TYPE || null,
      os: row.OS || null,
      country: row.COUNTRY || null,
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
  const n = typeof val === 'string' ? parseInt(val, 10) : val;
  return isNaN(n) ? 0 : n;
}

function toDecimal(val: string | number | undefined): number {
  if (val === undefined || val === null || val === '') return 0;
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(n) ? 0 : Math.round(n * 10000) / 10000; // 4 decimal places
}
