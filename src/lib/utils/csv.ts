/**
 * Convert an array of objects to CSV string.
 * Does NOT include BOM - caller should add BOM_PREFIX once at the start of the file.
 */
export function arrayToCSV(
  data: Record<string, unknown>[],
  columns?: string[]
): string {
  if (data.length === 0) return '';

  const keys = columns || Object.keys(data[0]);

  const escapeCell = (val: unknown): string => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = keys.map(escapeCell).join(',');
  const rows = data.map((row) =>
    keys.map((key) => escapeCell(row[key])).join(',')
  );

  return [header, ...rows].join('\n');
}

/** BOM prefix for Excel UTF-8 compatibility. Add once at the start of file. */
export const CSV_BOM = '\uFEFF';
