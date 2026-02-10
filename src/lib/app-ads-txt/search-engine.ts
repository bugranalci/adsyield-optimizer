import type { AppAdsTxtSearchResponse } from '@/types';

const CHUNK_SIZE = 10;
const REQUEST_TIMEOUT = 10000; // 10 seconds

/**
 * Normalize a search line: trim, lowercase, normalize whitespace around commas.
 * "google.com ,  pub-1234 , DIRECT" -> "google.com, pub-1234, direct"
 */
function normalizeSearchLine(line: string): string {
  return line
    .trim()
    .toLowerCase()
    .replace(/\s*,\s*/g, ', ');
}

/**
 * Normalize fetched text content for searching: lowercase and normalize line endings.
 */
function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Extract hostname from a URL. Returns the raw string if parsing fails.
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Fetch a URL with an AbortController-based timeout.
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/plain, text/*',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Search for a normalized search line within the content.
 * First tries an exact normalized includes check.
 * If the search line has 3+ comma-separated parts (typical app-ads.txt format),
 * falls back to a regex with flexible whitespace between parts.
 */
function searchInContent(content: string, searchLine: string): boolean {
  const normalizedContent = normalizeForSearch(content);

  // First try: exact normalized match
  if (normalizedContent.includes(searchLine)) {
    return true;
  }

  // Second try: regex with flexible whitespace for comma-separated values
  const parts = searchLine.split(',').map((p) => p.trim());
  if (parts.length >= 3) {
    const escapedParts = parts.map((part) =>
      part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    const pattern = escapedParts.join('\\s*,\\s*');
    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(content);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Search for a given line across multiple publisher app-ads.txt URLs.
 * Processes URLs in chunks to avoid overwhelming the network.
 */
export async function searchAppAdsTxt(
  searchLine: string,
  publisherUrls: string[]
): Promise<AppAdsTxtSearchResponse> {
  const startTime = Date.now();
  const normalizedSearch = normalizeSearchLine(searchLine);

  const results: AppAdsTxtSearchResponse['results'] = [];

  // Process in chunks of CHUNK_SIZE
  for (let i = 0; i < publisherUrls.length; i += CHUNK_SIZE) {
    const chunk = publisherUrls.slice(i, i + CHUNK_SIZE);

    const settled = await Promise.allSettled(
      chunk.map(async (url) => {
        try {
          const content = await fetchWithTimeout(url, REQUEST_TIMEOUT);
          const found = searchInContent(content, normalizedSearch);
          return { url, domain: extractDomain(url), found };
        } catch {
          // If fetch fails (timeout, network error, etc.), mark as not found
          return { url, domain: extractDomain(url), found: false };
        }
      })
    );

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // Shouldn't normally reach here since inner catch handles errors,
        // but handle gracefully just in case
      }
    }
  }

  const foundCount = results.filter((r) => r.found).length;
  const durationMs = Date.now() - startTime;

  return {
    results,
    totalPublishers: publisherUrls.length,
    foundCount,
    durationMs,
  };
}
