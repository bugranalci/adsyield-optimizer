export const SYSTEM_PROMPT = `You are Adsyield's AI-powered programmatic advertising optimization assistant.

Your capabilities:
- Analyze performance data and provide actionable insights
- Recommend bid floor adjustments, partner optimizations, bundle strategies
- Advise on programmatic advertising strategy and best practices
- Help interpret metrics: eCPM, fill rate, bid rate, win rate, timeout rates
- Identify revenue opportunities and risk areas
- Provide IVT (Invalid Traffic) analysis guidance
- Assist with app-ads.txt compliance

Guidelines:
- Respond in the same language the user writes in (Turkish or English)
- Always be specific and data-driven in recommendations
- Include estimated revenue impact when suggesting changes
- You are advisory only - you cannot make changes to the system
- Reference specific partners, bundles, or metrics from the provided data context
- When data shows anomalies, proactively mention them
- Use programmatic advertising terminology naturally

Current Performance Context:
{PERFORMANCE_CONTEXT}`;

export function buildPerformanceContext(data: {
  totalRevenue: number;
  totalImpressions: number;
  avgECPM: number;
  fillRate: number;
  revenueChange: number;
  topPartners: Array<{ name: string; revenue: number; ecpm: number; fillRate: number }>;
  worstPartners: Array<{ name: string; revenue: number; ecpm: number; fillRate: number; timeoutRate: number }>;
  activeAlerts: number;
  criticalAlerts: number;
  topOpportunities: Array<{ description: string; potentialRevenue: number }>;
}): string {
  const lines: string[] = [];

  lines.push(`=== Last 7 Days Performance ===`);
  lines.push(`Total Revenue: $${data.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
  lines.push(`Total Impressions: ${data.totalImpressions.toLocaleString()}`);
  lines.push(`Average eCPM: $${data.avgECPM.toFixed(2)}`);
  lines.push(`Overall Fill Rate: ${data.fillRate.toFixed(1)}%`);
  lines.push(`Revenue Trend: ${data.revenueChange >= 0 ? '+' : ''}${data.revenueChange.toFixed(1)}% vs previous period`);

  if (data.topPartners.length > 0) {
    lines.push(`\n=== Top 5 Partners (by revenue) ===`);
    data.topPartners.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.name}: Revenue $${p.revenue.toFixed(2)}, eCPM $${p.ecpm.toFixed(2)}, Fill ${p.fillRate.toFixed(1)}%`);
    });
  }

  if (data.worstPartners.length > 0) {
    lines.push(`\n=== Underperforming Partners ===`);
    data.worstPartners.forEach((p) => {
      lines.push(`- ${p.name}: eCPM $${p.ecpm.toFixed(2)}, Fill ${p.fillRate.toFixed(1)}%, Timeouts ${p.timeoutRate.toFixed(1)}%`);
    });
  }

  if (data.activeAlerts > 0) {
    lines.push(`\n=== Active Alerts ===`);
    lines.push(`Total: ${data.activeAlerts} (${data.criticalAlerts} critical)`);
  }

  if (data.topOpportunities.length > 0) {
    lines.push(`\n=== Top Revenue Opportunities ===`);
    data.topOpportunities.forEach((o) => {
      lines.push(`- ${o.description}: Potential +$${o.potentialRevenue.toFixed(0)}`);
    });
  }

  return lines.join('\n');
}
