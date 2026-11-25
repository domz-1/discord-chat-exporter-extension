import { describe, expect, it } from 'bun:test';
import { parseToon, serializeToon } from '../src/lib/toon';

describe('TOON serializer & parser', () => {
  it('round-trips Discord messages with Arabic text, replies, and attachments', () => {
    const sampleMessages = [
      {
        id: '134567890123456789',
        author: 'Raneem Alashry',
        time: '2026-10-14 14:21:00',
        link: 'https://discord.com/channels/123/456/134567890123456789',
        reply_to: null,
        attachments: ['https://cdn.discordapp.com/attachments/123/456/img1.png'],
        content: 'الرسالة بتظهر مقروءة علطول أول ما تتبعت حتى لو مقفول الشات',
      },
      {
        id: '134567890123456790',
        author: 'Adham',
        time: '2026-10-14 14:25:00',
        link: 'https://discord.com/channels/123/456/134567890123456790',
        reply_to: 'Raneem Alashry: الرسالة بتظهر مقروءة علطول',
        attachments: null,
        content: 'تمام هراجع كود الـ client في SeenMessengerService.ts',
      },
    ];

    const toonStr = serializeToon(sampleMessages, [
      'id',
      'author',
      'time',
      'link',
      'reply_to',
      'attachments',
      'content',
    ]);
    const parsed = parseToon(toonStr);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.id).toBe('134567890123456789');
    expect(parsed[0]?.author).toBe('Raneem Alashry');
    expect(parsed[0]?.attachments).toEqual([
      'https://cdn.discordapp.com/attachments/123/456/img1.png',
    ]);
    expect(parsed[1]?.reply_to).toBe('Raneem Alashry: الرسالة بتظهر مقروءة علطول');
  });
});
