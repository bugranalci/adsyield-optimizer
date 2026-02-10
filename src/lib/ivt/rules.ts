import type { IVTRuleResult } from '@/types';

// ============================================
// Thresholds
// ============================================
export const IFA_FREQUENCY_THRESHOLD = 100;
export const IP_FREQUENCY_THRESHOLD = 200;

// ============================================
// Frequency Context (passed from analyzer)
// ============================================
export interface FrequencyContext {
  ifaCounts: Map<string, number>;
  ipCounts: Map<string, number>;
}

// ============================================
// Known datacenter IP prefixes
// ============================================
const DATACENTER_IP_PREFIXES: string[] = [
  // AWS
  '3.', '13.52.', '13.54.', '13.56.', '13.58.', '18.', '34.', '35.', '43.', '52.', '54.',
  // GCP
  '34.64.', '34.80.', '34.96.', '34.128.', '35.186.', '35.192.', '35.224.', '35.240.',
  // Azure
  '13.64.', '13.72.', '13.104.', '20.', '40.', '52.136.', '52.224.', '104.40.', '104.208.',
  // DigitalOcean
  '104.131.', '104.236.', '159.65.', '159.89.', '165.22.', '167.172.', '174.138.', '206.189.',
  // Hetzner
  '5.9.', '78.46.', '88.99.', '88.198.', '116.202.', '116.203.', '135.181.', '138.201.',
  '148.251.', '159.69.', '168.119.', '195.201.',
  // OVH
  '51.38.', '51.68.', '51.77.', '51.83.', '51.89.', '51.91.', '51.210.', '54.36.', '54.37.',
  '54.38.', '91.134.', '92.222.', '137.74.', '142.44.', '144.217.', '149.56.', '158.69.',
  '164.132.', '167.114.', '176.31.', '178.32.', '188.165.', '193.70.', '198.27.', '198.50.',
  '198.100.',
  // Vultr
  '45.32.', '45.63.', '45.76.', '45.77.', '64.156.', '64.237.', '66.42.', '104.156.',
  '104.238.', '108.61.', '136.244.', '140.82.', '149.28.', '155.138.', '207.148.', '208.167.',
  '209.250.', '217.163.',
  // Linode
  '45.33.', '45.56.', '45.79.', '50.116.', '66.175.', '69.164.', '72.14.', '74.207.',
  '96.126.', '97.107.', '139.162.', '143.42.', '172.104.', '172.105.', '176.58.', '178.79.',
  '192.155.', '194.195.', '198.58.', '198.74.',
];

// ============================================
// Bot User-Agent pattern
// ============================================
const BOT_UA_PATTERN = /bot|crawl|spider|slurp|mediapartners|adsbot|bingpreview|facebookexternalhit|googlebot|baiduspider|yandex|headless|phantom|selenium|puppeteer|playwright|wget|curl|python-requests|java\/|httpclient|okhttp\/1\.|libwww|Go-http-client|scrapy|urllib|aiohttp|httpx|node-fetch/i;

// ============================================
// Known invalid IFA patterns
// ============================================
const ALL_ZEROS_IFA = '00000000-0000-0000-0000-000000000000';
const KNOWN_PLACEHOLDER_IFA_PREFIX = 'AEBE52E7-';

// ============================================
// Device/OS mappings for mismatch detection
// ============================================
const APPLE_DEVICES = ['apple', 'iphone', 'ipad'];
const ANDROID_MAKERS = [
  'samsung', 'huawei', 'xiaomi', 'oppo', 'vivo', 'oneplus',
  'google', 'motorola', 'lg', 'sony',
];

// ============================================
// Rule 1: Invalid IFA check
// ============================================
export function checkInvalidIFA(ifa: string | null): IVTRuleResult {
  const result: IVTRuleResult = {
    ruleId: 'invalid_ifa',
    ruleName: 'Invalid IFA',
    category: 'GIVT',
    weight: 1.0,
    triggered: false,
  };

  if (!ifa || ifa.trim() === '') {
    result.triggered = true;
    return result;
  }

  const normalized = ifa.trim().toUpperCase();

  // All-zeros IFA
  if (normalized === ALL_ZEROS_IFA.toUpperCase()) {
    result.triggered = true;
    return result;
  }

  // Known placeholder
  if (normalized.startsWith(KNOWN_PLACEHOLDER_IFA_PREFIX)) {
    result.triggered = true;
    return result;
  }

  // Repeating characters (low entropy): 2 or fewer unique chars
  const uniqueChars = new Set(normalized.replace(/-/g, ''));
  if (uniqueChars.size <= 2) {
    result.triggered = true;
    return result;
  }

  return result;
}

// ============================================
// Rule 2: High-frequency IFA
// ============================================
export function checkHighFrequencyIFA(
  ifa: string | null,
  frequencyContext: FrequencyContext
): IVTRuleResult {
  const result: IVTRuleResult = {
    ruleId: 'high_freq_ifa',
    ruleName: 'High Frequency IFA',
    category: 'SIVT',
    weight: 0.8,
    triggered: false,
  };

  if (!ifa || ifa.trim() === '') {
    return result;
  }

  const count = frequencyContext.ifaCounts.get(ifa);
  if (count !== undefined && count > IFA_FREQUENCY_THRESHOLD) {
    result.triggered = true;
  }

  return result;
}

// ============================================
// Rule 3: High-frequency IP
// ============================================
export function checkHighFrequencyIP(
  ip: string | null,
  frequencyContext: FrequencyContext
): IVTRuleResult {
  const result: IVTRuleResult = {
    ruleId: 'high_freq_ip',
    ruleName: 'High Frequency IP',
    category: 'SIVT',
    weight: 0.7,
    triggered: false,
  };

  if (!ip || ip.trim() === '') {
    return result;
  }

  const count = frequencyContext.ipCounts.get(ip);
  if (count !== undefined && count > IP_FREQUENCY_THRESHOLD) {
    result.triggered = true;
  }

  return result;
}

// ============================================
// Rule 4: Datacenter IP detection
// ============================================
export function checkDatacenterIP(ip: string | null): IVTRuleResult {
  const result: IVTRuleResult = {
    ruleId: 'datacenter_ip',
    ruleName: 'Datacenter IP',
    category: 'GIVT',
    weight: 1.0,
    triggered: false,
  };

  if (!ip || ip.trim() === '') {
    return result;
  }

  const trimmedIp = ip.trim();
  for (const prefix of DATACENTER_IP_PREFIXES) {
    if (trimmedIp.startsWith(prefix)) {
      result.triggered = true;
      return result;
    }
  }

  return result;
}

// ============================================
// Rule 5: Bot User-Agent detection
// ============================================
export function checkBotUserAgent(ua: string | null): IVTRuleResult {
  const result: IVTRuleResult = {
    ruleId: 'bot_user_agent',
    ruleName: 'Bot User Agent',
    category: 'GIVT',
    weight: 1.0,
    triggered: false,
  };

  if (!ua || ua.trim() === '') {
    result.triggered = true;
    return result;
  }

  if (BOT_UA_PATTERN.test(ua)) {
    result.triggered = true;
  }

  return result;
}

// ============================================
// Rule 6: Bundle validation
// ============================================
export function checkBundleValidation(bundle: string | null): IVTRuleResult {
  const result: IVTRuleResult = {
    ruleId: 'invalid_bundle',
    ruleName: 'Invalid Bundle',
    category: 'GIVT',
    weight: 0.6,
    triggered: false,
  };

  if (!bundle || bundle.trim() === '') {
    result.triggered = true;
    return result;
  }

  const trimmed = bundle.trim().toLowerCase();

  // Known test/example bundles
  if (trimmed === 'com.test' || trimmed === 'com.example') {
    result.triggered = true;
    return result;
  }

  // Single word without dot (not a valid reverse-domain bundle ID)
  if (!trimmed.includes('.')) {
    result.triggered = true;
    return result;
  }

  return result;
}

// ============================================
// Rule 7: Device/OS mismatch
// ============================================
export function checkDeviceOSMismatch(
  deviceMake: string | null,
  os: string | null
): IVTRuleResult {
  const result: IVTRuleResult = {
    ruleId: 'device_os_mismatch',
    ruleName: 'Device OS Mismatch',
    category: 'SIVT',
    weight: 1.0,
    triggered: false,
  };

  if (!deviceMake || !os) {
    return result;
  }

  const makeLower = deviceMake.trim().toLowerCase();
  const osLower = os.trim().toLowerCase();

  // Apple device running Android
  const isAppleDevice = APPLE_DEVICES.some((d) => makeLower.includes(d));
  if (isAppleDevice && osLower.includes('android')) {
    result.triggered = true;
    return result;
  }

  // Android maker running iOS
  const isAndroidMaker = ANDROID_MAKERS.some((d) => makeLower.includes(d));
  if (isAndroidMaker && osLower.includes('ios')) {
    result.triggered = true;
    return result;
  }

  return result;
}

// ============================================
// Main orchestrator: Evaluate all rules
// ============================================
export function evaluateAllRules(
  impression: {
    ifa: string | null;
    ip: string | null;
    user_agent: string | null;
    bundle: string | null;
    device_make: string | null;
    os: string | null;
  },
  frequencyContext: FrequencyContext
): { reasons: string[]; score: number; isSuspicious: boolean } {
  const rules: IVTRuleResult[] = [
    checkInvalidIFA(impression.ifa),
    checkHighFrequencyIFA(impression.ifa, frequencyContext),
    checkHighFrequencyIP(impression.ip, frequencyContext),
    checkDatacenterIP(impression.ip),
    checkBotUserAgent(impression.user_agent),
    checkBundleValidation(impression.bundle),
    checkDeviceOSMismatch(impression.device_make, impression.os),
  ];

  const triggeredRules = rules.filter((r) => r.triggered);
  const reasons = triggeredRules.map((r) => r.ruleId);
  const score = triggeredRules.reduce((sum, r) => sum + r.weight, 0);
  const isSuspicious = score >= 1.0;

  return { reasons, score, isSuspicious };
}
