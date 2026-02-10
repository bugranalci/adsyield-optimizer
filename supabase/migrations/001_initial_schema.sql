-- Adsyield Programmatic Optimizer - Database Schema
-- Supabase PostgreSQL

-- ============================================
-- USER PROFILES (extends Supabase Auth)
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'account_manager' CHECK (role IN ('admin', 'account_manager')),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'account_manager')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- LIMELIGHT STATS (core data)
-- ============================================
CREATE TABLE public.limelight_stats (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  demand_partner_name TEXT,
  supply_partner_name TEXT,
  publisher TEXT,
  bundle TEXT,
  ad_unit_type TEXT,
  channel_type TEXT,
  os TEXT,
  country TEXT,
  opportunities BIGINT DEFAULT 0,
  bid_requests BIGINT DEFAULT 0,
  bids BIGINT DEFAULT 0,
  wins BIGINT DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  pub_payout DECIMAL(14,4) DEFAULT 0,
  demand_payout DECIMAL(14,4) DEFAULT 0,
  demand_service_fee DECIMAL(14,4) DEFAULT 0,
  bid_response_timeouts BIGINT DEFAULT 0,
  bid_response_errors BIGINT DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, demand_partner_name, supply_partner_name, publisher, bundle, ad_unit_type, os, country)
);

CREATE INDEX idx_stats_date ON public.limelight_stats(date);
CREATE INDEX idx_stats_demand ON public.limelight_stats(demand_partner_name);
CREATE INDEX idx_stats_supply ON public.limelight_stats(supply_partner_name);
CREATE INDEX idx_stats_bundle ON public.limelight_stats(bundle);
CREATE INDEX idx_stats_publisher ON public.limelight_stats(publisher);
CREATE INDEX idx_stats_date_demand ON public.limelight_stats(date, demand_partner_name);
CREATE INDEX idx_stats_date_supply ON public.limelight_stats(date, supply_partner_name);
CREATE INDEX idx_stats_country ON public.limelight_stats(country);
CREATE INDEX idx_stats_os ON public.limelight_stats(os);

-- ============================================
-- IVT (Invalid Traffic) TRACKING
-- ============================================
CREATE TABLE public.ivt_impressions (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  pub_id TEXT,
  bundle TEXT,
  ifa TEXT,
  ip INET,
  user_agent TEXT,
  device_make TEXT,
  device_model TEXT,
  os TEXT,
  os_version TEXT,
  creative_id TEXT,
  origin_ssp_pub_id TEXT,
  lat DECIMAL(9,6),
  lon DECIMAL(9,6),
  imp_id TEXT UNIQUE,
  is_suspicious BOOLEAN DEFAULT FALSE,
  ivt_reasons TEXT[] DEFAULT '{}',
  ivt_score INTEGER DEFAULT 0,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ivt_timestamp ON public.ivt_impressions(timestamp);
CREATE INDEX idx_ivt_ip ON public.ivt_impressions(ip);
CREATE INDEX idx_ivt_ifa ON public.ivt_impressions(ifa);
CREATE INDEX idx_ivt_bundle ON public.ivt_impressions(bundle);
CREATE INDEX idx_ivt_suspicious ON public.ivt_impressions(is_suspicious) WHERE is_suspicious = TRUE;
CREATE INDEX idx_ivt_pub_id ON public.ivt_impressions(pub_id);
CREATE INDEX idx_ivt_created ON public.ivt_impressions(created_at);

CREATE TABLE public.ivt_ip_frequency (
  ip INET PRIMARY KEY,
  impression_count INTEGER DEFAULT 0,
  unique_bundles INTEGER DEFAULT 0,
  unique_devices INTEGER DEFAULT 0,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  is_flagged BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- APP-ADS.TXT TRACKING
-- ============================================
CREATE TABLE public.publisher_domains (
  id SERIAL PRIMARY KEY,
  domain TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_checked TIMESTAMPTZ,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.app_ads_txt_results (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES public.publisher_domains(id) ON DELETE CASCADE,
  search_line TEXT NOT NULL,
  found BOOLEAN NOT NULL,
  content TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.app_ads_txt_search_history (
  id SERIAL PRIMARY KEY,
  search_line TEXT NOT NULL,
  total_publishers INTEGER,
  found_count INTEGER,
  duration_ms INTEGER,
  searched_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI CHAT
-- ============================================
CREATE TABLE public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_conv_user ON public.chat_conversations(user_id);
CREATE INDEX idx_chat_conv_updated ON public.chat_conversations(updated_at DESC);

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_msg_conv ON public.chat_messages(conversation_id);
CREATE INDEX idx_chat_msg_created ON public.chat_messages(created_at);

-- ============================================
-- ALERTS & OPTIMIZATION TASKS
-- ============================================
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('performance', 'revenue', 'technical', 'quality')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  metric TEXT NOT NULL,
  threshold DECIMAL,
  current_value DECIMAL,
  previous_value DECIMAL,
  change_pct DECIMAL,
  message TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_severity ON public.alerts(severity);
CREATE INDEX idx_alerts_resolved ON public.alerts(resolved) WHERE resolved = FALSE;
CREATE INDEX idx_alerts_created ON public.alerts(created_at DESC);

CREATE TABLE public.optimization_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('critical', 'important', 'growth')),
  title TEXT NOT NULL,
  description TEXT,
  impact TEXT,
  estimated_revenue DECIMAL,
  effort TEXT CHECK (effort IN ('low', 'medium', 'high')),
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'completed')),
  actions TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_status ON public.optimization_tasks(status);
CREATE INDEX idx_tasks_priority ON public.optimization_tasks(priority);

-- ============================================
-- DATA SYNC LOGS
-- ============================================
CREATE TABLE public.sync_logs (
  id SERIAL PRIMARY KEY,
  sync_type TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  rows_synced INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.limelight_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ivt_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ivt_ip_frequency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publisher_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_ads_txt_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_ads_txt_search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimization_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read own, admins can read all
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- All authenticated users can read data tables
CREATE POLICY "Authenticated users can read stats" ON public.limelight_stats
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage stats" ON public.limelight_stats
  FOR ALL TO service_role USING (true);

CREATE POLICY "Authenticated users can read IVT" ON public.ivt_impressions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage IVT" ON public.ivt_impressions
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role can manage IP frequency" ON public.ivt_ip_frequency
  FOR ALL TO service_role USING (true);

CREATE POLICY "Authenticated users can read IP frequency" ON public.ivt_ip_frequency
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read publisher domains" ON public.publisher_domains
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage ads txt results" ON public.app_ads_txt_results
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage search history" ON public.app_ads_txt_search_history
  FOR ALL TO authenticated USING (true);

-- Chat: users see own conversations
CREATE POLICY "Users can manage own conversations" ON public.chat_conversations
  FOR ALL TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can manage own messages" ON public.chat_messages
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations
      WHERE id = chat_messages.conversation_id AND user_id = auth.uid()
    )
  );

-- Alerts and tasks: all authenticated users
CREATE POLICY "Authenticated users can read alerts" ON public.alerts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage alerts" ON public.alerts
  FOR ALL TO service_role USING (true);

CREATE POLICY "Authenticated users can manage tasks" ON public.optimization_tasks
  FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can read sync logs" ON public.sync_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage sync logs" ON public.sync_logs
  FOR ALL TO service_role USING (true);
