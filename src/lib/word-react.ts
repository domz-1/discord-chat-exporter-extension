export const DEFAULT_REACT_WORD = 'DONE';
export const MAX_REACTIONS_PER_MESSAGE = 20;

const ARABIC_DIGIT_MAP: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

const keycap = (ch: string) => `${ch}\uFE0F\u20E3`;

/**
 * Blue-first candidates for all English letters (A-Z), digits (0-9), and symbols,
 * with visual fallbacks when a letter/digit repeats on the same message.
 */
const CHAR_EMOJI_CANDIDATES: Record<string, string[]> = {
  A: ['\u{1F1E6}', '\u{1F170}\uFE0F'],
  B: ['\u{1F1E7}', '\u{1F171}\uFE0F'],
  C: ['\u{1F1E8}', '\u00A9\uFE0F'],
  D: ['\u{1F1E9}'],
  E: ['\u{1F1EA}', keycap('3')],
  F: ['\u{1F1EB}'],
  G: ['\u{1F1EC}'],
  H: ['\u{1F1ED}', '\u2653'],
  I: ['\u{1F1EE}', '\u2139\uFE0F', keycap('1')],
  J: ['\u{1F1EF}'],
  K: ['\u{1F1F0}'],
  L: ['\u{1F1F1}'],
  M: ['\u{1F1F2}', '\u24C2\uFE0F'],
  N: ['\u{1F1F3}'],
  O: ['\u{1F1F4}', keycap('0'), '\u{1F17E}\uFE0F', '\u2B55'],
  P: ['\u{1F1F5}', '\u{1F17F}\uFE0F'],
  Q: ['\u{1F1F6}'],
  R: ['\u{1F1F7}', '\u00AE\uFE0F'],
  S: ['\u{1F1F8}', keycap('5'), '\u{1F4B2}'],
  T: ['\u{1F1F9}', '\u271D\uFE0F'],
  U: ['\u{1F1FA}'],
  V: ['\u{1F1FB}', '\u270C\uFE0F'],
  W: ['\u{1F1FC}'],
  X: ['\u{1F1FD}', '\u274C', '\u2716\uFE0F'],
  Y: ['\u{1F1FE}'],
  Z: ['\u{1F1FF}', '\u{1F4A4}'],

  '0': [keycap('0'), '\u{1F1F4}', '\u{1F17E}\uFE0F', '\u2B55'],
  '1': [keycap('1'), '\u{1F1EE}', '\u2139\uFE0F', '\u261D\uFE0F'],
  '2': [keycap('2'), '\u270C\uFE0F'],
  '3': [keycap('3')],
  '4': [keycap('4')],
  '5': [keycap('5')],
  '6': [keycap('6')],
  '7': [keycap('7')],
  '8': [keycap('8'), '\u{1F3B1}'],
  '9': [keycap('9')],

  '!': ['\u2757', '\u2755', '\u203C\uFE0F'],
  '?': ['\u2753', '\u2754'],
  '#': [keycap('#')],
  '*': [keycap('*')],
  '+': ['\u2795'],
  '-': ['\u2796'],
  '$': ['\u{1F4B2}'],
};

const EMOJI_GRAPHEME_RE = /\p{Extended_Pictographic}/u;

export function normalizeArabicNumerals(input: string): string {
  return input.replace(/[٠-٩]/g, (ch) => ARABIC_DIGIT_MAP[ch] ?? ch);
}

function splitGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/**
 * Converts any word (English letters, digits 0-9, Arabic digits ٠-٩, symbols, or direct emojis)
 * into an ordered, deduplicated list of Discord reaction emojis (blue-first, with fallbacks on repeats).
 */
export function wordToReactionEmojis(word: string): string[] {
  const normalized = normalizeArabicNumerals(word || '').trim();
  if (!normalized) return [];

  const graphemes = splitGraphemes(normalized);
  const used = new Set<string>();
  const emojis: string[] = [];

  for (const grapheme of graphemes) {
    if (emojis.length >= MAX_REACTIONS_PER_MESSAGE) break;
    if (!grapheme.trim()) continue;

    const upper = grapheme.toUpperCase();
    const candidates = CHAR_EMOJI_CANDIDATES[upper];

    if (candidates) {
      const pick = candidates.find((emoji) => !used.has(emoji));
      if (pick) {
        used.add(pick);
        emojis.push(pick);
      }
      continue;
    }

    // Pass through direct Unicode emojis (e.g. 🔥, 💀, 💙)
    if (EMOJI_GRAPHEME_RE.test(grapheme) && !used.has(grapheme)) {
      used.add(grapheme);
      emojis.push(grapheme);
    }
  }

  return emojis;
}

/**
 * Builds Discord's native PUT reaction endpoint URL for a Unicode emoji.
 */
export function buildReactionEndpoint(
  channelId: string,
  messageId: string,
  emoji: string,
): string {
  return `https://discord.com/api/v9/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me?location=Message%20Hover%20Bar&type=0`;
}
