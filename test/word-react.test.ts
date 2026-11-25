import { describe, expect, it } from 'bun:test';
import {
  MAX_REACTIONS_PER_MESSAGE,
  buildReactionEndpoint,
  normalizeArabicNumerals,
  wordToReactionEmojis,
} from '../src/lib/word-react';

describe('word-to-emoji reaction mapper (blue-only letters & digits)', () => {
  it('supports all 26 English letters A-Z case-insensitively as blue regional indicators', () => {
    const firstHalf = wordToReactionEmojis('abcdefghijklm');
    const secondHalf = wordToReactionEmojis('NOPQRSTUVWXYZ');
    expect(firstHalf).toHaveLength(13);
    expect(secondHalf).toHaveLength(13);
    expect(firstHalf[0]).toBe('\u{1F1E6}'); // A
    expect(secondHalf[12]).toBe('\u{1F1FF}'); // Z
  });

  it('supports all digits 0-9 with variation selector FE0F + keycap 20E3', () => {
    const digits = wordToReactionEmojis('0123456789');
    expect(digits).toHaveLength(10);
    expect(digits[0]).toBe('0\uFE0F\u20E3');
    expect(digits[7]).toBe('7\uFE0F\u20E3');
    expect(digits[9]).toBe('9\uFE0F\u20E3');
  });

  it('converts Eastern Arabic numerals to blue keycap reactions', () => {
    expect(normalizeArabicNumerals('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(wordToReactionEmojis('A٧O0')).toEqual([
      '\u{1F1E6}',
      '7\uFE0F\u20E3',
      '\u{1F1F4}',
      '0\uFE0F\u20E3',
    ]);
  });

  it('uses ONLY blue fallbacks for repeated letters and never emits red A/B/O emojis', () => {
    // BOOK uses blue O + blue 0 (no red 🅾️)
    expect(wordToReactionEmojis('BOOK')).toEqual([
      '\u{1F1E7}',
      '\u{1F1F4}',
      '0\uFE0F\u20E3',
      '\u{1F1F0}',
    ]);
    // PP uses blue P + blue 🅿️
    expect(wordToReactionEmojis('PP')).toEqual(['\u{1F1F5}', '\u{1F17F}\uFE0F']);
    // Repeated A skips red 🅰️ and stays blue-only
    const repeated = wordToReactionEmojis('A7A');
    expect(repeated).toEqual(['\u{1F1E6}', '7\uFE0F\u20E3']);
    expect(repeated).not.toContain('\u{1F170}\uFE0F');
  });

  it('passes through direct emojis and caps at Discord limit (20)', () => {
    expect(wordToReactionEmojis('GG 💙')).toEqual(['\u{1F1EC}', '💙']);
    const longInput = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    expect(wordToReactionEmojis(longInput).length).toBeLessThanOrEqual(MAX_REACTIONS_PER_MESSAGE);
  });

  it('builds properly URL-encoded Discord PUT reaction endpoint', () => {
    const url = buildReactionEndpoint('111', '222', '7\uFE0F\u20E3');
    expect(url).toBe(
      'https://discord.com/api/v9/channels/111/messages/222/reactions/7%EF%B8%8F%E2%83%A3/@me?location=Message%20Hover%20Bar&type=0',
    );
  });
});
