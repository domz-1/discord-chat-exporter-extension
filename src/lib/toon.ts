/**
 * TOON (Token-Oriented Object Notation) Serializer & Parser
 * Compact, token-efficient serialization format optimized for LLMs.
 * Format:
 * [count]{key1,key2,key3}:
 * val1,val2,val3
 */

export function escapeToonValue(val: unknown): string {
  if (val === null || val === undefined) {
    return 'null';
  }
  if (typeof val === 'boolean' || typeof val === 'number') {
    return String(val);
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    const jsonStr = JSON.stringify(val);
    return `"${jsonStr.replace(/"/g, '""')}"`;
  }
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val);
    return `"${jsonStr.replace(/"/g, '""')}"`;
  }

  const str = String(val);
  if (str.includes(',') || str.includes('\n') || str.includes('"') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str.length === 0 ? '""' : str;
}

export function serializeToon<T extends object>(
  items: T[],
  keys?: (keyof T | string)[] | null,
): string {
  if (!items || !items.length) {
    return '[0]{}:';
  }

  const firstItem = items[0];
  if (!firstItem) return '[0]{}:';
  const fieldKeys = (keys && keys.length ? keys : Object.keys(firstItem)) as string[];
  const header = `[${items.length}]{${fieldKeys.join(',')}}:`;

  const rows = items.map((item) => {
    const record = item as Record<string, unknown>;
    return fieldKeys.map((k) => escapeToonValue(record[k])).join(',');
  });

  return `${header}\n${rows.join('\n')}`;
}

export function parseToon(toonStr: string): Record<string, unknown>[] {
  if (!toonStr || !toonStr.trim()) return [];
  const lines = toonStr.trim().split('\n');
  const headerLine = lines[0] ?? '';
  const headerMatch = headerLine.match(/^\[(\d+)\]\{([^}]+)\}:/);
  if (!headerMatch || !headerMatch[2]) throw new Error('Invalid TOON header format');

  const keys = headerMatch[2].split(',').map((s) => s.trim());
  const results: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line) continue;

    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        if (inQuotes && line[j + 1] === '"') {
          current += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    const obj: Record<string, unknown> = {};
    keys.forEach((key, idx) => {
      const raw = values[idx] !== undefined ? values[idx] : null;
      if (raw === null || raw === 'null') {
        obj[key] = null;
      } else if (raw === 'true') {
        obj[key] = true;
      } else if (raw === 'false') {
        obj[key] = false;
      } else if (!Number.isNaN(Number(raw)) && raw !== '' && !raw.startsWith('+') && !raw.startsWith('0x')) {
        if (key.includes('id') || raw.length >= 16) {
          obj[key] = raw;
        } else {
          obj[key] = Number(raw);
        }
      } else if (typeof raw === 'string' && (raw.startsWith('[') || raw.startsWith('{'))) {
        try {
          obj[key] = JSON.parse(raw);
        } catch {
          obj[key] = raw;
        }
      } else {
        obj[key] = raw;
      }
    });
    results.push(obj);
  }

  return results;
}
