-- ============================================
-- Ads.txt Tables (Web Publishers)
-- Run this in Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS)
-- ============================================

-- publisher_domains_web: Web publisher ads.txt URL'leri
CREATE TABLE IF NOT EXISTS publisher_domains_web (
  id SERIAL PRIMARY KEY,
  domain TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_checked TIMESTAMPTZ,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- ads_txt_search_history: Arama gecmisi
CREATE TABLE IF NOT EXISTS ads_txt_search_history (
  id SERIAL PRIMARY KEY,
  search_line TEXT NOT NULL,
  total_publishers INTEGER,
  found_count INTEGER,
  duration_ms INTEGER,
  searched_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security)
ALTER TABLE publisher_domains_web ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads_txt_search_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'publisher_domains_web' AND policyname = 'Service role full access web') THEN
    CREATE POLICY "Service role full access web" ON publisher_domains_web FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ads_txt_search_history' AND policyname = 'Service role full access ads') THEN
    CREATE POLICY "Service role full access ads" ON ads_txt_search_history FOR ALL USING (true);
  END IF;
END
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_publisher_domains_web_domain ON publisher_domains_web(domain);
CREATE INDEX IF NOT EXISTS idx_publisher_domains_web_status ON publisher_domains_web(status);
CREATE INDEX IF NOT EXISTS idx_ads_txt_search_history_searched_at ON ads_txt_search_history(searched_at DESC);
