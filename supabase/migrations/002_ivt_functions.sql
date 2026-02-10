-- ============================================
-- IVT SQL RPC Functions
-- Run this in Supabase SQL Editor to create the functions
-- Safe to re-run (uses CREATE OR REPLACE)
-- ============================================

-- 1. get_ifa_frequency: Returns IFA + count for high-frequency devices
CREATE OR REPLACE FUNCTION get_ifa_frequency(
  start_ts TIMESTAMPTZ,
  end_ts TIMESTAMPTZ
)
RETURNS TABLE(ifa TEXT, cnt BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT
    ivt.ifa,
    COUNT(*) AS cnt
  FROM ivt_impressions ivt
  WHERE ivt.timestamp >= start_ts
    AND ivt.timestamp < end_ts
    AND ivt.ifa IS NOT NULL
    AND ivt.ifa != ''
  GROUP BY ivt.ifa
  HAVING COUNT(*) > 50
$$;

-- 2. get_ip_frequency: Returns IP + count for high-frequency IPs
CREATE OR REPLACE FUNCTION get_ip_frequency(
  start_ts TIMESTAMPTZ,
  end_ts TIMESTAMPTZ
)
RETURNS TABLE(ip TEXT, cnt BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT
    ivt.ip::TEXT,
    COUNT(*) AS cnt
  FROM ivt_impressions ivt
  WHERE ivt.timestamp >= start_ts
    AND ivt.timestamp < end_ts
    AND ivt.ip IS NOT NULL
  GROUP BY ivt.ip
  HAVING COUNT(*) > 100
$$;

-- 3. get_ivt_reason_counts: Unnest ivt_reasons array and count each
CREATE OR REPLACE FUNCTION get_ivt_reason_counts(
  start_ts TIMESTAMPTZ,
  end_ts TIMESTAMPTZ
)
RETURNS TABLE(reason TEXT, cnt BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT
    unnest(ivt.ivt_reasons) AS reason,
    COUNT(*) AS cnt
  FROM ivt_impressions ivt
  WHERE ivt.is_suspicious = true
    AND ivt.timestamp >= start_ts
    AND ivt.timestamp < end_ts
  GROUP BY reason
  ORDER BY cnt DESC
  LIMIT 20
$$;

-- 4. get_ivt_daily_trend: Daily totals and suspicious counts
CREATE OR REPLACE FUNCTION get_ivt_daily_trend(
  start_ts TIMESTAMPTZ,
  end_ts TIMESTAMPTZ
)
RETURNS TABLE(day DATE, total BIGINT, suspicious BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT
    DATE(ivt.timestamp) AS day,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE ivt.is_suspicious = true) AS suspicious
  FROM ivt_impressions ivt
  WHERE ivt.timestamp >= start_ts
    AND ivt.timestamp < end_ts
  GROUP BY DATE(ivt.timestamp)
  ORDER BY day
$$;

-- 5. get_ivt_top_ips: Top suspicious IPs with counts
CREATE OR REPLACE FUNCTION get_ivt_top_ips(
  start_ts TIMESTAMPTZ,
  end_ts TIMESTAMPTZ,
  lim INTEGER DEFAULT 20
)
RETURNS TABLE(ip TEXT, cnt BIGINT, unique_bundles BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT
    ivt.ip::TEXT,
    COUNT(*) AS cnt,
    COUNT(DISTINCT ivt.bundle) AS unique_bundles
  FROM ivt_impressions ivt
  WHERE ivt.is_suspicious = true
    AND ivt.timestamp >= start_ts
    AND ivt.timestamp < end_ts
  GROUP BY ivt.ip
  ORDER BY cnt DESC
  LIMIT lim
$$;

-- 6. get_ivt_top_bundles: Top suspicious bundles with counts and rate
CREATE OR REPLACE FUNCTION get_ivt_top_bundles(
  start_ts TIMESTAMPTZ,
  end_ts TIMESTAMPTZ,
  lim INTEGER DEFAULT 20
)
RETURNS TABLE(bundle TEXT, total_count BIGINT, suspicious_count BIGINT, suspicious_rate NUMERIC)
LANGUAGE sql STABLE
AS $$
  SELECT
    ivt.bundle,
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE ivt.is_suspicious = true) AS suspicious_count,
    ROUND(
      COUNT(*) FILTER (WHERE ivt.is_suspicious = true)::NUMERIC / NULLIF(COUNT(*), 0) * 100,
      2
    ) AS suspicious_rate
  FROM ivt_impressions ivt
  WHERE ivt.timestamp >= start_ts
    AND ivt.timestamp < end_ts
    AND ivt.bundle IS NOT NULL
  GROUP BY ivt.bundle
  HAVING COUNT(*) FILTER (WHERE ivt.is_suspicious = true) > 0
  ORDER BY suspicious_count DESC
  LIMIT lim
$$;
