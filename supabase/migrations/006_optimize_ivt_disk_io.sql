-- ============================================
-- Optimize IVT disk IO
-- Problem: 7 single-column indexes on ivt_impressions cause massive
-- write amplification on every pixel fire INSERT (~9 indexes updated per row).
-- Solution: Replace with 3 targeted indexes + add data retention cleanup.
-- Run this in Supabase SQL Editor.
-- ============================================

-- Step 1: Drop redundant single-column indexes
-- These columns are only used in GROUP BY after timestamp filtering,
-- so the timestamp index alone is sufficient for query performance.
DROP INDEX IF EXISTS idx_ivt_ip;
DROP INDEX IF EXISTS idx_ivt_ifa;
DROP INDEX IF EXISTS idx_ivt_bundle;
DROP INDEX IF EXISTS idx_ivt_pub_id;
DROP INDEX IF EXISTS idx_ivt_created;

-- Step 2: Add one composite index for report queries
-- Report queries filter by (created_at range + pub_id), this covers them all.
CREATE INDEX IF NOT EXISTS idx_ivt_created_pub
  ON public.ivt_impressions(created_at, pub_id);

-- Keep existing (these are essential):
-- idx_ivt_timestamp  -> used by all 6 RPC analysis functions
-- idx_ivt_suspicious -> partial index (only is_suspicious=true rows), very lightweight

-- Result: 9 indexes per INSERT -> 5 indexes per INSERT (PK + UNIQUE + 3 indexes)
-- = ~44% fewer index writes per pixel fire

-- Step 3: Data retention - delete impressions older than 30 days
-- This prevents unbounded table growth and reduces disk usage.
-- Run as a scheduled job via pg_cron or Vercel Cron.
CREATE OR REPLACE FUNCTION public.cleanup_old_ivt_impressions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.ivt_impressions
  WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Vacuum analyze to reclaim space from dropped indexes
-- (Run this manually after the migration)
-- VACUUM ANALYZE public.ivt_impressions;
