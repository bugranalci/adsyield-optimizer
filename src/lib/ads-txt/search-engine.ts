import type { AppAdsTxtSearchResponse } from '@/types';

const CHUNK_SIZE = 10;
const REQUEST_TIMEOUT = 10000; // 10 seconds

function normalizeSearchLine(line: string): string {
  return line
    .trim()
    .toLowerCase()
    .replace(/\s*,\s*/g, ', ');
}

function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

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

function searchInContent(content: string, searchLine: string): boolean {
  const normalizedContent = normalizeForSearch(content);

  if (normalizedContent.includes(searchLine)) {
    return true;
  }

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
 * Search for a given line across multiple publisher ads.txt URLs.
 */
export async function searchAdsTxt(
  searchLine: string,
  publisherUrls: string[]
): Promise<AppAdsTxtSearchResponse> {
  const startTime = Date.now();
  const normalizedSearch = normalizeSearchLine(searchLine);

  const results: AppAdsTxtSearchResponse['results'] = [];

  for (let i = 0; i < publisherUrls.length; i += CHUNK_SIZE) {
    const chunk = publisherUrls.slice(i, i + CHUNK_SIZE);

    const settled = await Promise.allSettled(
      chunk.map(async (url) => {
        try {
          const content = await fetchWithTimeout(url, REQUEST_TIMEOUT);
          const found = searchInContent(content, normalizedSearch);
          return { url, domain: extractDomain(url), found };
        } catch {
          return { url, domain: extractDomain(url), found: false };
        }
      })
    );

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
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
