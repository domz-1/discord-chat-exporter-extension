import { describe, expect, it } from 'bun:test';
import {
  buildForwardPayload,
  buildMessageReference,
  generateDiscordNonce,
  isDiscordMessagesEndpoint,
  isForwardRequestBody,
} from '../src/lib/forward';

describe('native Discord multi-forward payload helpers', () => {
  it('detects Discord message REST endpoints', () => {
    expect(isDiscordMessagesEndpoint('https://discord.com/api/v9/channels/1298559450205917215/messages')).toBe(true);
    expect(isDiscordMessagesEndpoint('/api/v10/channels/123456/messages')).toBe(true);
    expect(isDiscordMessagesEndpoint('https://discord.com/api/v9/science')).toBe(false);
  });

  it('identifies forward payloads (message_reference.type === 1) vs replies (type === 0)', () => {
    expect(
      isForwardRequestBody({
        content: '',
        message_reference: { type: 1, channel_id: '111', message_id: '222' },
      }),
    ).toBe(true);
    expect(
      isForwardRequestBody({
        content: 'hello',
        message_reference: { type: 0, channel_id: '111', message_id: '222' },
      }),
    ).toBe(false);
    expect(isForwardRequestBody({ content: 'plain message' })).toBe(false);
  });

  it('omits guild_id for DM (@me) targets and keeps it for server channels', () => {
    expect(
      buildMessageReference({ messageId: '222', channelId: '111', guildId: '@me' }),
    ).toEqual({
      type: 1,
      channel_id: '111',
      message_id: '222',
    });

    expect(
      buildMessageReference({ messageId: '222', channelId: '111', guildId: '999' }),
    ).toEqual({
      type: 1,
      channel_id: '111',
      message_id: '222',
      guild_id: '999',
    });
  });

  it('builds distinct snowflake nonces and strips optional comment on follow-up forwards', () => {
    const base = {
      content: 'optional note',
      flags: 0,
      tts: false,
      nonce: '11111',
      message_reference: { type: 1, channel_id: '10', message_id: '20' },
    };

    const next = buildForwardPayload(
      base,
      { channelId: '10', messageId: '21', guildId: '555' },
      { preserveContent: false, nowMs: 1795607919121 },
    );

    expect(next.content).toBe('');
    expect(next.nonce).not.toBe('11111');
    expect(next.message_reference).toEqual({
      type: 1,
      channel_id: '10',
      message_id: '21',
      guild_id: '555',
    });

    const n1 = generateDiscordNonce(1795607919121);
    const n2 = generateDiscordNonce(1795607919121);
    expect(n1).not.toBe(n2);
  });
});
