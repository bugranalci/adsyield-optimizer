-- ============================================
-- App-Ads.txt Tables
-- Run this in Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS)
-- ============================================

-- publisher_domains: Publisher URL'leri
CREATE TABLE IF NOT EXISTS publisher_domains (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_checked TIMESTAMPTZ,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- app_ads_txt_search_history: Arama gecmisi
CREATE TABLE IF NOT EXISTS app_ads_txt_search_history (
  id SERIAL PRIMARY KEY,
  search_line TEXT NOT NULL,
  total_publishers INTEGER,
  found_count INTEGER,
  duration_ms INTEGER,
  searched_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security)
ALTER TABLE publisher_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_ads_txt_search_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'publisher_domains' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON publisher_domains FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'app_ads_txt_search_history' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON app_ads_txt_search_history FOR ALL USING (true);
  END IF;
END
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_publisher_domains_status ON publisher_domains(status);
CREATE INDEX IF NOT EXISTS idx_search_history_searched_at ON app_ads_txt_search_history(searched_at DESC);
