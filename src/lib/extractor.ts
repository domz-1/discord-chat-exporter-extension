import type { DiscordMessage } from './types';

export const MESSAGE_SELECTOR = 'li[id^="chat-messages-"], div[id^="chat-messages-"]';

export interface ParsedMessageMeta {
  channelId: string | null;
  messageId: string | null;
}

export interface ChannelContext {
  guildId: string;
  channelId: string;
}

/**
 * Extracts channel & message snowflake IDs from a message element's DOM id.
 * Supports modern `chat-messages-<channelId>-<msgId>` and legacy `chat-messages-<msgId>`.
 */
export function parseMessageMeta(elId: string): ParsedMessageMeta {
  if (!elId || typeof elId !== 'string' || !elId.startsWith('chat-messages-')) {
    return { channelId: null, messageId: null };
  }
  const suffix = elId.slice('chat-messages-'.length);
  const parts = suffix.split('-').filter(Boolean);
  const candidate = parts[parts.length - 1];
  if (!candidate || !/^\d+$/.test(candidate)) {
    return { channelId: null, messageId: null };
  }
  const firstPart = parts[0];
  const channelPart = parts.length >= 2 && firstPart && /^\d+$/.test(firstPart) ? firstPart : null;
  return { channelId: channelPart, messageId: candidate };
}

export function parseMessageId(elId: string): string | null {
  return parseMessageMeta(elId).messageId;
}

/**
 * Sorts Discord messages chronologically using their 64-bit snowflake IDs.
 */
export function sortMessagesChronologically<T extends { id: string }>(messages: T[]): T[] {
  return [...messages].sort((a, b) => {
    try {
      const idA = BigInt(a.id);
      const idB = BigInt(b.id);
      if (idA < idB) return -1;
      if (idA > idB) return 1;
      return 0;
    } catch {
      return String(a.id).localeCompare(String(b.id));
    }
  });
}

/**
 * Computes inclusive range of message IDs between anchorId and targetId in DOM order.
 */
export function computeRangeIds(
  orderedIds: string[],
  anchorId: string,
  targetId: string,
): string[] {
  const startIdx = orderedIds.indexOf(anchorId);
  const endIdx = orderedIds.indexOf(targetId);
  if (startIdx === -1 || endIdx === -1) {
    return targetId ? [targetId] : [];
  }
  const from = Math.min(startIdx, endIdx);
  const to = Math.max(startIdx, endIdx);
  return orderedIds.slice(from, to + 1);
}

/**
 * Formats extracted messages into clean Markdown.
 */
export function formatMessagesAsMarkdown(messages: DiscordMessage[]): string {
  return messages
    .map((m) => {
      const parts = [`### [${m.author}](${m.link}) - *${m.time}*`];
      if (m.reply_to) {
        parts.push(`> Replying to ${m.reply_to}`);
      }
      if (m.content) {
        parts.push(m.content);
      }
      if (m.attachments && m.attachments.length) {
        parts.push(m.attachments.map((att) => `![attachment](${att})`).join('\n'));
      }
      if (m.reactions) {
        parts.push(`*Reactions:* ${m.reactions}`);
      }
      return `${parts.join('\n')}\n`;
    })
    .join('\n---\n\n');
}

/**
 * Strips internal helper keys so JSON export stays strictly clean.
 */
export function toExportableMessage(msg: DiscordMessage): Omit<DiscordMessage, 'channelId' | 'guildId'> {
  return {
    id: msg.id,
    author: msg.author,
    time: msg.time,
    link: msg.link,
    reply_to: msg.reply_to,
    reactions: msg.reactions,
    attachments: msg.attachments,
    content: msg.content,
  };
}

interface ElementLike {
  previousElementSibling?: ElementLike | null;
  querySelector?: (selector: string) => { textContent?: string | null; closest?: (s: string) => unknown } | null;
  querySelectorAll?: (selector: string) => Iterable<{ textContent?: string | null; closest?: (s: string) => unknown }>;
}

/**
 * Finds the message's own author element, avoiding usernames nested inside reply previews.
 */
function findOwnAuthorElement(el: ElementLike | null) {
  if (!el || typeof el.querySelector !== 'function') return null;
  const direct = el.querySelector('span[id^="message-username-"], h3 span[class*="username_"]');
  if (direct) return direct;

  if (typeof el.querySelectorAll === 'function') {
    for (const candidate of el.querySelectorAll('span[class*="username_"]')) {
      if (!candidate.closest || !candidate.closest('div[class*="repliedMessage_"]')) {
        return candidate;
      }
    }
  }
  return el.querySelector('span[class*="username_"]');
}

/**
 * Resolves the author name for a message element, walking upward through previous
 * siblings to inherit the author for Discord's grouped follow-up messages.
 */
export function resolveAuthorForElement(
  el: ElementLike | null,
  fallbackAuthor: string | null = null,
): string {
  let cursor = el;
  let hops = 0;
  while (cursor && hops < 40) {
    const authorEl = findOwnAuthorElement(cursor);
    if (authorEl?.textContent && authorEl.textContent.trim()) {
      return authorEl.textContent.trim();
    }
    cursor = cursor.previousElementSibling || null;
    hops++;
  }
  return fallbackAuthor || 'Unknown';
}

export function getChannelContext(): ChannelContext {
  const urlParts = window.location.pathname.split('/').filter(Boolean);
  const guildId = urlParts[1] || '@me';
  const channelId = urlParts[2] || '';
  return { guildId, channelId };
}

/**
 * Extracts a single structured message object from a Discord DOM message element.
 */
export function extractSingleMessage(
  el: Element,
  fallbackAuthor: string | null = null,
  context: ChannelContext | null = null,
): DiscordMessage | null {
  const { channelId: domChannelId, messageId: msgId } = parseMessageMeta(el.id);
  if (!msgId) return null;

  const { guildId, channelId: urlChannelId } = context || getChannelContext();
  const effectiveChannelId = domChannelId || urlChannelId;
  const author = resolveAuthorForElement(el as unknown as ElementLike, fallbackAuthor);

  const timeEl = el.querySelector('time');
  const timestamp = timeEl ? timeEl.getAttribute('datetime') || timeEl.textContent?.trim() || '' : '';

  const msgLink = `https://discord.com/channels/${guildId}/${effectiveChannelId}/${msgId}`;

  // Reply context
  let replyTo: { author: string; text: string } | null = null;
  const replyEl = el.querySelector('div[class*="repliedMessage_"]');
  if (replyEl) {
    const replyAuthorEl = replyEl.querySelector('span[class*="username_"]');
    const replyContentEl = replyEl.querySelector('div[class*="repliedTextContent_"]');
    replyTo = {
      author: replyAuthorEl?.textContent?.trim() || 'Unknown',
      text: replyContentEl?.textContent?.trim() || '',
    };
  }

  // Attachments (excluding avatars & inline emojis)
  const attachments: string[] = [];
  const mediaEls = el.querySelectorAll<HTMLAnchorElement | HTMLImageElement>(
    'a[class*="originalLink_"], a[target="_blank"][href*="cdn.discordapp.com"], img[src*="cdn.discordapp.com"]',
  );
  mediaEls.forEach((m) => {
    const url = 'href' in m && m.href ? m.href : 'src' in m ? m.src : '';
    if (url && !url.includes('/emojis/') && !url.includes('/avatars/') && !attachments.includes(url)) {
      attachments.push(url);
    }
  });

  const standardAttach = el.querySelectorAll<HTMLAnchorElement>('div[class*="attachment_"] a');
  standardAttach.forEach((a) => {
    if (a.href && !attachments.includes(a.href)) {
      attachments.push(a.href);
    }
  });

  // Content text (preserving custom emojis as :name:)
  const contentEl = el.querySelector('div[id^="message-content-"], div[class*="messageContent_"]');
  let content = '';
  if (contentEl) {
    const clone = contentEl.cloneNode(true) as HTMLElement;
    const emojiImgs = clone.querySelectorAll('img[class*="emoji"], img[alt^=":"]');
    emojiImgs.forEach((img) => {
      const alt = img.getAttribute('alt') || '';
      if (alt && img.parentNode) {
        img.parentNode.replaceChild(document.createTextNode(alt), img);
      }
    });
    content = (clone.innerText || clone.textContent || '').trim();
  }

  // Reactions
  const reactions: string[] = [];
  const seenReactions = new Set<string>();
  const reactionEls = el.querySelectorAll('div[class*="reaction_"], [class*="reactionInner_"]');
  reactionEls.forEach((r) => {
    if (r.parentElement?.matches?.('div[class*="reaction_"]')) {
      return;
    }
    const emojiImg = r.querySelector('img[class*="emoji"]');
    const emojiText =
      emojiImg?.getAttribute('alt') ||
      r.querySelector('[class*="reactionEmoji_"]')?.textContent ||
      '';
    const count = r.querySelector('[class*="reactionCount_"]')?.textContent || '1';
    if (emojiText) {
      const entry = `${emojiText} ${count}`.trim();
      if (!seenReactions.has(entry)) {
        seenReactions.add(entry);
        reactions.push(entry);
      }
    }
  });

  return {
    id: msgId,
    author,
    time: timestamp,
    link: msgLink,
    reactions: reactions.length > 0 ? reactions.join(', ') : null,
    reply_to: replyTo ? `${replyTo.author}: ${replyTo.text}` : null,
    attachments: attachments.length > 0 ? attachments : null,
    content,
    channelId: effectiveChannelId,
    guildId,
  };
}

/**
 * Extracts all currently visible messages in the DOM.
 */
export function extractVisibleMessages(limit: number | null = null): DiscordMessage[] {
  const messageElements = Array.from(document.querySelectorAll(MESSAGE_SELECTOR));
  const context = getChannelContext();
  const messages: DiscordMessage[] = [];
  let lastAuthor: string | null = null;

  for (const el of messageElements) {
    const msg = extractSingleMessage(el, lastAuthor, context);
    if (!msg) continue;
    if (msg.author && msg.author !== 'Unknown') {
      lastAuthor = msg.author;
    }
    messages.push(msg);
    if (limit && messages.length >= limit) break;
  }

  return messages;
}
