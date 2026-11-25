import { describe, expect, it } from 'bun:test';
import {
  computeRangeIds,
  formatMessagesAsMarkdown,
  parseMessageId,
  parseMessageMeta,
  resolveAuthorForElement,
  sortMessagesChronologically,
} from '../src/lib/extractor';
import { isMutedSidebarItem } from '../src/lib/muted';

describe('extractor & muted detection', () => {
  it('parses modern and legacy Discord message IDs', () => {
    expect(parseMessageId('chat-messages-123456789012345678')).toBe('123456789012345678');
    expect(parseMessageId('chat-messages-999888777-123456789012345678')).toBe('123456789012345678');
    expect(parseMessageMeta('chat-messages-999888777-123456789012345678')).toEqual({
      channelId: '999888777',
      messageId: '123456789012345678',
    });
    expect(parseMessageId('chat-messages-divider')).toBeNull();
    expect(parseMessageId('')).toBeNull();
  });

  it('sorts 64-bit Discord snowflakes chronologically', () => {
    const sorted = sortMessagesChronologically([
      { id: '134567890123456795', content: 'third' },
      { id: '134567890123456789', content: 'first' },
      { id: '134567890123456790', content: 'second' },
    ]);
    expect(sorted.map((m) => m.content)).toEqual(['first', 'second', 'third']);
  });

  it('computes forward and backward Shift+Click ranges', () => {
    const ordered = ['100', '101', '102', '103', '104'];
    expect(computeRangeIds(ordered, '101', '103')).toEqual(['101', '102', '103']);
    expect(computeRangeIds(ordered, '104', '102')).toEqual(['102', '103', '104']);
    expect(computeRangeIds(ordered, '999', '102')).toEqual(['102']);
  });

  it('formats Markdown including reply, attachment, and reactions', () => {
    const md = formatMessagesAsMarkdown([
      {
        id: '134567890123456789',
        author: 'Adham',
        time: '2026-10-14T14:25:00Z',
        link: 'https://discord.com/channels/1/2/134567890123456789',
        reply_to: 'Raneem: bug found',
        reactions: '👍 2, 🔥 1',
        attachments: ['https://cdn.discordapp.com/attachments/1/2/a.png'],
        content: 'Fixed it!',
      },
    ]);
    expect(md).toContain('### [Adham](https://discord.com/channels/1/2/134567890123456789)');
    expect(md).toContain('> Replying to Raneem: bug found');
    expect(md).toContain('![attachment](https://cdn.discordapp.com/attachments/1/2/a.png)');
    expect(md).toContain('👍 2, 🔥 1');
  });

  it('inherits author across grouped messages', () => {
    const makeNode = (author: string | null, prev: any = null) => ({
      previousElementSibling: prev,
      querySelector(sel: string) {
        if (sel.includes('username') && author) return { textContent: author };
        return null;
      },
    });
    const m1 = makeNode('Raneem Alashry');
    const m2 = makeNode(null, m1);
    const m3 = makeNode(null, m2);
    expect(resolveAuthorForElement(m3)).toBe('Raneem Alashry');
    expect(resolveAuthorForElement(makeNode(null))).toBe('Unknown');
  });

  it('detects muted server channels, muted categories, and muted DMs without false positives', () => {
    const makeEl = (className: string, children: { className: string }[] = []) => ({
      className,
      querySelector(sel: string) {
        if (sel.includes('modeMuted_')) {
          return children.find((c) => c.className.includes('modeMuted_')) || null;
        }
        return null;
      },
      querySelectorAll(sel: string) {
        if (sel.includes('muted_')) {
          return children.filter((c) => c.className.includes('muted_'));
        }
        return [];
      },
    });

    // Server channel muted
    expect(
      isMutedSidebarItem(makeEl('containerDefault_Wx6SnQ', [{ className: 'wrapper_TNyK-N modeMuted_TNyK-N' }])),
    ).toBe(true);
    // Server category muted
    expect(
      isMutedSidebarItem(makeEl('containerDefault_yOdhm_', [{ className: 'wrapper_yOdhm_ muted_yOdhm_' }])),
    ).toBe(true);
    // DM / Group DM muted (live Discord class observed via DevTools)
    expect(
      isMutedSidebarItem(makeEl('channel_TBNqol', [{ className: 'interactive_TBNqol muted_TBNqol' }])),
    ).toBe(true);
    // Unmuted channel
    expect(
      isMutedSidebarItem(makeEl('containerDefault_Wx6SnQ', [{ className: 'wrapper_TNyK-N' }])),
    ).toBe(false);
    // colorMuted_ should NOT match
    expect(
      isMutedSidebarItem(makeEl('containerDefault_abc', [{ className: 'root_KNAhcP colorMuted_KNAhcP' }])),
    ).toBe(false);
  });
});
