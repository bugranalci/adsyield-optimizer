// ============================================
// Limelight Stats (DB row format)
// ============================================
export interface LimelightStatsRow {
  id: number;
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
  synced_at: string;
  created_at: string;
}

// ============================================
// Limelight API Response
// ============================================
export interface LimelightAPIResponse {
  DATE?: string;
  // DEMAND dimension fields
  DEMAND_ID?: number;
  DEMAND_NAME?: string;
  DEMAND_PARTNER_NAME?: string; // Legacy CSV alias
  DEMAND?: string; // Legacy alias
  // PUBLISHER dimension fields
  PUBLISHER_ID?: number;
  PUBLISHER_NAME?: string;
  PUBLISHER?: string; // Legacy alias
  // Other dimensions
  BUNDLE?: string;
  SIZE?: string;
  AD_UNIT?: string;
  AD_UNIT_TYPE?: string;
  CHANNEL_TYPE?: string;
  OS?: string;
  COUNTRY?: string;
  SUPPLY_SOURCE?: string; // Legacy alias for bundle
  SUPPLY_PARTNER_NAME?: string; // Legacy CSV alias
  // Metrics
  OPPORTUNITIES?: number;
  BID_REQUESTS?: number;
  BIDS?: number;
  WINS?: number;
  IMPRESSIONS?: number;
  PUB_PAYOUT?: number;
  DEMAND_PAYOUT?: number;
  DEMAND_SERVICE_FEE_PAYOUT?: number;
  BID_RESPONSE_TIMEOUTS?: number;
  BID_RESPONSE_ERRORS?: number;
}

// ============================================
// Supply Demand Data (Analysis engine format - compatible with legacy)
// ============================================
export interface SupplyDemandData {
  date: Date;
  partner: string;
  partnerId: string;
  adSize: string;
  platform: 'iOS' | 'Android' | 'Web';
  bundle: string;
  bidRequests: number;
  bids: number;
  impressions: number;
  revenue: number;
  publisherPayout: number;
  bidRate: number;
  winRate: number;
  eCPM: number;
  fillRate: number;
  timeouts: number;
  errors: number;
  avgResponseTime: number;
  publisherId?: string;
  publisherName?: string;
  geo?: string;
  deviceType?: string;
  creativeId?: string;
  advertiserId?: string;
  filterReasons?: Array<{ reason: string; count: number }>;
  opportunities?: number;
  wins?: number;
  successRate?: number;
}

// ============================================
// Partner Performance
// ============================================
export interface PartnerPerformance {
  partnerId: string;
  partnerName: string;
  impressions: number;
  revenue: number;
  eCPM: number;
  fillRate: number;
  timeoutRate: number;
  score: number;
}

// ============================================
// Bundle Analytics
// ============================================
export interface BundleAnalytics {
  bundle: string;
  platform: 'iOS' | 'Android' | 'Web';
  category: string;
  totalImpressions: number;
  totalRevenue: number;
  avgECPM: number;
  topPartners: PartnerPerformance[];
  growthRate: number;
  potential: 'high' | 'medium' | 'low';
}

// ============================================
// Optimization
// ============================================
export interface OptimizationTask {
  id: string;
  type: 'revenue' | 'technical' | 'partner' | 'inventory';
  priority: 'critical' | 'important' | 'growth';
  title: string;
  description: string;
  impact: string;
  estimatedRevenue: number;
  effort: 'low' | 'medium' | 'high';
  status: 'todo' | 'in-progress' | 'completed';
  createdAt: Date;
  dueDate?: Date;
  actions: string[];
}

export interface RevenueOpportunity {
  type: 'arbitrage' | 'fill-rate' | 'pricing' | 'timeout';
  partner: string;
  bundle?: string;
  adSize?: string;
  currentRevenue: number;
  potentialRevenue: number;
  gap: number;
  confidence: number;
  recommendation: string;
}

export interface OptimizationRecommendation {
  id: string;
  type: 'partner' | 'bundle' | 'ad-size' | 'technical' | 'revenue';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  estimatedRevenueLift: number;
  timeToImplement: string;
  difficulty: 'easy' | 'medium' | 'hard';
  actionSteps: string[];
  kpis: string[];
  partner?: string;
  bundle?: string;
  adSize?: string;
  currentValue?: number;
  targetValue?: number;
  confidence: number;
}

// ============================================
// Dashboard
// ============================================
export interface DashboardMetrics {
  totalRevenue: number;
  totalImpressions: number;
  avgECPM: number;
  fillRate: number;
  revenueGrowth: number;
  topPartners: PartnerPerformance[];
  topBundles: BundleAnalytics[];
  criticalIssues: OptimizationTask[];
  opportunities: RevenueOpportunity[];
}

// ============================================
// Supply Quality
// ============================================
export interface SupplyQualityScore {
  publisherId: string;
  publisherName: string;
  bidRate: number;
  winRate: number;
  successRate: number;
  fillRate: number;
  qualityScore: number;
  scoreBreakdown: {
    bidRateScore: number;
    winRateScore: number;
    successRateScore: number;
    fillRateScore: number;
  };
  trend: 'improving' | 'stable' | 'declining';
  lastUpdated: Date;
}

// ============================================
// Creative Performance
// ============================================
export interface CreativePerformance {
  creativeId: string;
  advertiserId: string;
  wins: number;
  impressions: number;
  clicks: number;
  successRate: number;
  ctr: number;
  revenue: number;
  issues: CreativeIssue[];
  status: 'active' | 'warning' | 'blocked';
  lastUpdated: Date;
}

export interface CreativeIssue {
  type: 'low_success_rate' | 'no_impressions' | 'high_error_rate' | 'policy_violation';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  recommendation: string;
}

// ============================================
// Filter Reasons
// ============================================
export interface FilterReason {
  reason: string;
  category: 'OPPORTUNITY_FILTERED' | 'BID_REQUEST_FILTERED' | 'BIDS_FILTERED';
  count: number;
  revenueLoss: number;
  percentage: number;
  actionable: boolean;
  recommendation?: string;
}

// ============================================
// Demand Appetite
// ============================================
export interface DemandAppetite {
  demandPartnerId: string;
  demandPartnerName: string;
  preferences: {
    topGeos: Array<{ geo: string; bidRate: number; avgBid: number }>;
    topPublishers: Array<{ publisherId: string; name: string; revenue: number }>;
    topAdSizes: Array<{ size: string; impressions: number; eCPM: number }>;
    topDevices: Array<{ device: string; percentage: number }>;
    preferredDayparts: Array<{ hour: number; activity: number }>;
  };
  bidPatterns: {
    avgBidPrice: number;
    bidPriceRange: { min: number; max: number };
    bidFrequency: number;
    responseTime: number;
  };
  performance: {
    winRate: number;
    successRate: number;
    revenue: number;
    impressions: number;
  };
}

// ============================================
// Alerts
// ============================================
export interface Alert {
  id: string;
  type: 'performance' | 'revenue' | 'technical' | 'quality';
  severity: 'critical' | 'warning' | 'info';
  metric: string;
  threshold: number;
  currentValue: number;
  previousValue: number;
  change: number;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

// ============================================
// Revenue Concentration
// ============================================
export interface RevenueConcentration {
  publisherConcentration: ConcentrationMetric;
  demandConcentration: ConcentrationMetric;
  geoConcentration: ConcentrationMetric;
  deviceConcentration: ConcentrationMetric;
  herfindahlIndex: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ConcentrationMetric {
  top5Share: number;
  top10Share: number;
  distribution: Array<{ name: string; share: number; revenue: number }>;
}

// ============================================
// IVT Types
// ============================================
export interface IVTImpression {
  id: number;
  timestamp: string;
  pub_id: string | null;
  bundle: string | null;
  ifa: string | null;
  ip: string | null;
  user_agent: string | null;
  device_make: string | null;
  device_model: string | null;
  os: string | null;
  os_version: string | null;
  creative_id: string | null;
  origin_ssp_pub_id: string | null;
  lat: number | null;
  lon: number | null;
  imp_id: string | null;
  is_suspicious: boolean;
  ivt_reasons: string[];
  ivt_score: number;
  analyzed_at: string | null;
  created_at: string;
}

export interface IVTSummary {
  totalImpressions: number;
  suspiciousImpressions: number;
  suspiciousRate: number;
  topReasons: Array<{ reason: string; count: number }>;
  topSuspiciousIPs: Array<{ ip: string; count: number }>;
  topSuspiciousBundles: Array<{ bundle: string; count: number }>;
  dailyTrend: Array<{ date: string; total: number; suspicious: number }>;
}

export type IVTCategory = 'GIVT' | 'SIVT';

export interface IVTRuleResult {
  ruleId: string;
  ruleName: string;
  category: IVTCategory;
  weight: number;
  triggered: boolean;
}

export interface IVTAnalysisResult {
  analyzedCount: number;
  suspiciousCount: number;
  batchesProcessed: number;
  durationMs: number;
}

export interface IVTReportData {
  summary: {
    totalImpressions: number;
    suspiciousImpressions: number;
    suspiciousRate: number;
    givtCount: number;
    sivtCount: number;
    analyzedCount: number;
    unanalyzedCount: number;
  };
  topReasons: Array<{ reason: string; count: number }>;
  topSuspiciousIPs: Array<{ ip: string; count: number; uniqueBundles: number }>;
  topSuspiciousBundles: Array<{ bundle: string; count: number; suspiciousRate: number }>;
  dailyTrend: Array<{ date: string; total: number; suspicious: number; rate: number }>;
}

// ============================================
// Chat Types
// ============================================
export interface ChatConversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================
// App-Ads.txt Types
// ============================================
export interface PublisherDomain {
  id: number;
  domain: string;
  url: string;
  status: 'active' | 'inactive' | 'error';
  last_checked: string | null;
  added_at: string;
}

export interface AppAdsTxtResult {
  id: number;
  domain_id: number;
  search_line: string;
  found: boolean;
  content: string | null;
  checked_at: string;
  domain?: string;
}

export interface AppAdsTxtSearchResponse {
  results: Array<{
    url: string;
    domain: string;
    found: boolean;
  }>;
  totalPublishers: number;
  foundCount: number;
  durationMs: number;
}

export interface AppAdsTxtSearchHistoryItem {
  id: number;
  search_line: string;
  total_publishers: number;
  found_count: number;
  duration_ms: number;
  searched_at: string;
}

// ============================================
// Sync Types
// ============================================
export interface SyncLog {
  id: number;
  sync_type: string;
  start_date: string | null;
  end_date: string | null;
  rows_synced: number;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

// ============================================
// User / Auth Types
// ============================================
export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'account_manager';
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Ad Size & Timeout (legacy compat)
// ============================================
export interface AdSizeMetrics {
  size: string;
  opportunities: number;
  impressions: number;
  revenue: number;
  eCPM: number;
  fillRate: number;
  topBundles: string[];
  performance: 'high' | 'medium' | 'low';
}

export interface TimeoutAnalysis {
  partner: string;
  totalRequests: number;
  timeouts: number;
  timeoutRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  estimatedRevenueLoss: number;
  peakHours: number[];
}

export interface ECPMTrend {
  timestamp: Date;
  eCPM: number;
  fillRate: number;
  revenue: number;
  impressions: number;
  forecast?: {
    predictedECPM: number;
    confidence: number;
    trend: 'up' | 'down' | 'stable';
  };
}
