import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  publicDir: 'public',
  manifest: {
    name: 'Discord Chat Exporter (TOON & JSON)',
    version: '2.0.0',
    description:
      'Multi-select, forward, and export Discord messages, threads, replies, and attachments as TOON, JSON, or Markdown with Liquid Glass UI and muted channel hiding.',
    permissions: ['activeTab', 'clipboardWrite', 'storage'],
    host_permissions: ['https://discord.com/*'],
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  },
});
