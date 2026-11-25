import type { ForwardTargetRef } from './types';

const DISCORD_EPOCH = 1420070400000n;
let nonceSeq = 0n;

/**
 * Generates a Discord-compatible snowflake nonce so consecutive forwarded
 * messages are never deduplicated or rejected by Discord's API.
 */
export function generateDiscordNonce(nowMs = Date.now()): string {
  const ts = BigInt(nowMs) - DISCORD_EPOCH;
  nonceSeq = (nonceSeq + 1n) & 0xfffn;
  return ((ts << 22n) | nonceSeq).toString();
}

/**
 * Matches Discord REST message creation URLs:
 *   https://discord.com/api/v9/channels/{channelId}/messages
 *   /api/v9/channels/{channelId}/messages
 */
export function isDiscordMessagesEndpoint(url: string): boolean {
  return /\/api\/v\d+\/channels\/\d+\/messages(?:\?.*)?$/.test(url);
}

/**
 * Checks whether a parsed JSON body represents a native Discord Forward request
 * (message_reference.type === 1).
 */
export function isForwardRequestBody(body: unknown): body is Record<string, unknown> {
  if (!body || typeof body !== 'object') return false;
  const ref = (body as Record<string, unknown>).message_reference;
  if (!ref || typeof ref !== 'object') return false;
  return (ref as Record<string, unknown>).type === 1;
}

/**
 * Builds the `message_reference` object matching Discord's native Forward schema.
 * Omits `guild_id` for Direct Messages (`@me`) and includes it for server channels.
 */
export function buildMessageReference(target: ForwardTargetRef): Record<string, unknown> {
  const ref: Record<string, unknown> = {
    type: 1,
    channel_id: target.channelId,
    message_id: target.messageId,
  };
  if (target.guildId && target.guildId !== '@me') {
    ref.guild_id = target.guildId;
  }
  return ref;
}

/**
 * Constructs a forward request JSON payload from Discord's own captured base payload,
 * swapping in the target message reference and a fresh snowflake nonce.
 */
export function buildForwardPayload(
  baseBody: Record<string, unknown>,
  target: ForwardTargetRef,
  options: { preserveContent?: boolean; nowMs?: number } = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...baseBody,
    content: options.preserveContent && typeof baseBody.content === 'string' ? baseBody.content : '',
    tts: false,
    flags: typeof baseBody.flags === 'number' ? baseBody.flags : 0,
    nonce: generateDiscordNonce(options.nowMs),
    message_reference: buildMessageReference(target),
  };

  delete payload.sticker_ids;
  delete payload.attachments;
  return payload;
}
