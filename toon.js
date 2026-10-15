/**
 * TOON (Token-Oriented Object Notation) Serializer
 * Compact, token-efficient serialization format optimized for LLMs.
 * Format:
 * [count]{key1,key2,key3}:
 * val1,val2,val3
 *
 * Strings with commas/newlines/quotes are properly quoted.
 * Nulls/undefined are rendered as null.
 * Nested arrays/objects are JSON-stringified and escaped.
 */

function escapeToonValue(val) {
  if (val === null || val === undefined) {
    return 'null';
  }
  if (typeof val === 'boolean' || typeof val === 'number') {
    return String(val);
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    // If it's an array of strings/primitives
    const jsonStr = JSON.stringify(val);
    return `"${jsonStr.replace(/"/g, '""')}"`;
  }
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val);
    return `"${jsonStr.replace(/"/g, '""')}"`;
  }

  // String handling
  const str = String(val);
  if (str.includes(',') || str.includes('\n') || str.includes('"') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str.length === 0 ? '""' : str;
}

/**
 * Serializes an array of uniform message objects into TOON format
 * @param {Array<Object>} items
 * @param {Array<string>} [keys]
 * @returns {string}
 */
function serializeToon(items, keys = null) {
  if (!items || !items.length) {
    return '[0]{}:';
  }

  const fieldKeys = keys || Object.keys(items[0]);
  const header = `[${items.length}]{${fieldKeys.join(',')}}:`;

  const rows = items.map(item => {
    return fieldKeys.map(k => escapeToonValue(item[k])).join(',');
  });

  return `${header}\n${rows.join('\n')}`;
}

/**
 * Parses a TOON string back into an array of objects
 * @param {string} toonStr
 * @returns {Array<Object>}
 */
function parseToon(toonStr) {
  if (!toonStr || !toonStr.trim()) return [];
  const lines = toonStr.trim().split('\n');
  const headerMatch = lines[0].match(/^\[(\d+)\]\{([^}]+)\}:/);
  if (!headerMatch) throw new Error('Invalid TOON header format');

  const count = parseInt(headerMatch[1], 10);
  const keys = headerMatch[2].split(',').map(s => s.trim());
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV-style row parsing with quotes
    const values = [];
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

    const obj = {};
    keys.forEach((key, idx) => {
      let raw = values[idx] !== undefined ? values[idx] : null;
      if (raw === 'null') {
        obj[key] = null;
      } else if (raw === 'true') {
        obj[key] = true;
      } else if (raw === 'false') {
        obj[key] = false;
      } else if (!isNaN(raw) && raw !== '' && !raw.startsWith('+') && !raw.startsWith('0x')) {
        // Only cast to number if not an ID (Discord IDs are 64-bit snowflakes, preserve as string)
        if (key.includes('id') || raw.length >= 16) {
          obj[key] = raw;
        } else {
          obj[key] = Number(raw);
        }
      } else {
        // Check if JSON array/object
        if (typeof raw === 'string' && (raw.startsWith('[') || raw.startsWith('{'))) {
          try {
            obj[key] = JSON.parse(raw);
          } catch (_) {
            obj[key] = raw;
          }
        } else {
          obj[key] = raw;
        }
      }
    });
    results.push(obj);
  }

  return results;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { serializeToon, parseToon, escapeToonValue };
}
