export interface DiscordMessage {
  id: string;
  author: string;
  time: string;
  link: string;
  reply_to: string | null;
  reactions: string | null;
  attachments: string[] | null;
  content: string;
  /** Internal metadata for native forwarding (omitted from MESSAGE_KEYS export schema) */
  channelId?: string;
  guildId?: string;
}

export interface ForwardTargetRef {
  messageId: string;
  channelId: string;
  guildId?: string | null;
}

export interface ForwardSessionPayload {
  sessionId: string;
  messages: ForwardTargetRef[];
}

export interface ForwardProgressDetail {
  sessionId: string;
  sent: number;
  total: number;
  done: boolean;
  failed?: number;
  error?: string;
}

export type ExportFormat = 'toon' | 'json' | 'markdown';

export interface ExtractOptions {
  selectedOnly?: boolean;
  mode?: 'auto' | 'selected' | 'all';
  limit?: number | null;
}

export interface ExtractResponse {
  messages: DiscordMessage[];
  toon: string;
  markdown: string;
  count: number;
  usedSelected: boolean;
  selectedCount: number;
}

export interface ExtensionStateResponse {
  selectedCount: number;
  hideMutedChannels: boolean;
}

export const MESSAGE_KEYS: (keyof DiscordMessage)[] = [
  'id',
  'author',
  'time',
  'link',
  'reply_to',
  'reactions',
  'attachments',
  'content',
];

export const STORAGE_KEY_HIDE_MUTED = 'dce_hide_muted_channels';
export const EVENT_ARM_FORWARD = 'dce:arm-forward';
export const EVENT_DISARM_FORWARD = 'dce:disarm-forward';
export const EVENT_FORWARD_PROGRESS = 'dce:forward-progress';
