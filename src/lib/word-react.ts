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
 * Blue-only Discord Twemoji candidates for all English letters (A-Z),
 * digits (0-9), and blue keycap symbols — no red/non-blue fallbacks.
 */
const CHAR_EMOJI_CANDIDATES: Record<string, string[]> = {
  A: ['\u{1F1E6}'],
  B: ['\u{1F1E7}'],
  C: ['\u{1F1E8}'],
  D: ['\u{1F1E9}'],
  E: ['\u{1F1EA}', keycap('3')],
  F: ['\u{1F1EB}'],
  G: ['\u{1F1EC}'],
  H: ['\u{1F1ED}'],
  I: ['\u{1F1EE}', '\u2139\uFE0F', keycap('1')],
  J: ['\u{1F1EF}'],
  K: ['\u{1F1F0}'],
  L: ['\u{1F1F1}'],
  M: ['\u{1F1F2}', '\u24C2\uFE0F'],
  N: ['\u{1F1F3}'],
  O: ['\u{1F1F4}', keycap('0')],
  P: ['\u{1F1F5}', '\u{1F17F}\uFE0F'],
  Q: ['\u{1F1F6}'],
  R: ['\u{1F1F7}'],
  S: ['\u{1F1F8}', keycap('5')],
  T: ['\u{1F1F9}'],
  U: ['\u{1F1FA}'],
  V: ['\u{1F1FB}'],
  W: ['\u{1F1FC}'],
  X: ['\u{1F1FD}'],
  Y: ['\u{1F1FE}'],
  Z: ['\u{1F1FF}', '\u{1F4A4}'],

  '0': [keycap('0'), '\u{1F1F4}'],
  '1': [keycap('1'), '\u{1F1EE}', '\u2139\uFE0F'],
  '2': [keycap('2')],
  '3': [keycap('3')],
  '4': [keycap('4')],
  '5': [keycap('5')],
  '6': [keycap('6')],
  '7': [keycap('7')],
  '8': [keycap('8')],
  '9': [keycap('9')],

  '#': [keycap('#')],
  '*': [keycap('*')],
  '!': ['\u2755'],
  '?': ['\u2754'],
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
 * Converts any word (English letters, digits 0-9, Arabic digits ٠-٩, blue symbols, or direct emojis)
 * into an ordered, deduplicated list of blue Discord reaction emojis (max 20).
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
