/**
 * Discord DOM Scraper & Message Extractor
 */

// Selected fields schema for TOON & JSON export
const MESSAGE_KEYS = ['id', 'author', 'time', 'link', 'reply_to', 'attachments', 'content'];

/**
 * Extracts clean structured messages currently visible in the active channel/thread
 */
function extractDiscordMessages(options = {}) {
  const { selectedOnly = false, limit = null } = options;
  const messageElements = Array.from(document.querySelectorAll('li[id^="chat-messages-"], div[id^="chat-messages-"]'));

  // Extract guild and channel from current URL
  // e.g. https://discord.com/channels/123456789/987654321 or .../987654321/threads/11223344
  const urlParts = window.location.pathname.split('/').filter(Boolean);
  const guildId = urlParts[1] || '@me';
  const channelId = urlParts[2] || '';

  const messages = [];

  for (const el of messageElements) {
    const rawId = el.id.replace('chat-messages-', '');
    if (!rawId || isNaN(rawId.charAt(0))) continue;

    // Check if selected
    if (selectedOnly && !el.classList.contains('selected-message')) {
      continue;
    }

    // Author
    const authorEl = el.querySelector('span[class*="username_"], span[id^="message-username-"]');
    const author = authorEl ? authorEl.textContent.trim() : 'Unknown';

    // Timestamp
    const timeEl = el.querySelector('time');
    const timestamp = timeEl ? timeEl.getAttribute('datetime') || timeEl.textContent.trim() : '';

    // Direct link to Discord message
    const msgLink = `https://discord.com/channels/${guildId}/${channelId}/${rawId}`;

    // Reply context (replied-to message)
    let replyTo = null;
    const replyEl = el.querySelector('div[class*="repliedMessage_"]');
    if (replyEl) {
      const replyAuthorEl = replyEl.querySelector('span[class*="username_"]');
      const replyContentEl = replyEl.querySelector('div[class*="repliedTextContent_"]');
      replyTo = {
        author: replyAuthorEl ? replyAuthorEl.textContent.trim() : 'Unknown',
        text: replyContentEl ? replyContentEl.textContent.trim() : ''
      };
    }

    // Attachments (Images, Videos, Embeds, File links)
    const attachments = [];
    const mediaEls = el.querySelectorAll('a[class*="originalLink_"], a[target="_blank"][href*="cdn.discordapp.com"], img[src*="cdn.discordapp.com"]');
    mediaEls.forEach(m => {
      let url = m.href || m.src;
      if (url && !url.includes('/emojis/') && !url.includes('/avatars/')) {
        // Clean query params or keep full CDN URL
        attachments.push(url);
      }
    });

    // Also check standard attachments container
    const standardAttach = el.querySelectorAll('div[class*="attachment_"] a');
    standardAttach.forEach(a => {
      if (a.href && !attachments.includes(a.href)) {
        attachments.push(a.href);
      }
    });

    // Content text (Preserve code blocks, markdown text)
    const contentEl = el.querySelector('div[id^="message-content-"], div[class*="messageContent_"]');
    let content = '';
    if (contentEl) {
      content = contentEl.innerText.trim();
    }

    messages.push({
      id: rawId,
      author,
      time: timestamp,
      link: msgLink,
      reply_to: replyTo ? `${replyTo.author}: ${replyTo.text}` : null,
      attachments: attachments.length > 0 ? attachments : null,
      content
    });

    if (limit && messages.length >= limit) break;
  }

  return messages;
}

/**
 * Creates floating UI toolbar inside Discord Web
 */
function injectFloatingToolbar() {
  if (document.getElementById('discord-exporter-toolbar')) return;

  const toolbar = document.createElement('div');
  toolbar.id = 'discord-exporter-toolbar';
  toolbar.innerHTML = `
    <div class="exporter-header">
      <span class="exporter-title">⚡ Discord Exporter</span>
      <span class="exporter-badge">TOON / JSON</span>
    </div>
    <div class="exporter-buttons">
      <button id="btn-copy-toon" title="Copy as Token-Oriented Object Notation (token saver for LLMs)">
        📋 Copy TOON
      </button>
      <button id="btn-copy-json" title="Copy full JSON payload">
        📦 Copy JSON
      </button>
      <button id="btn-copy-markdown" title="Copy clean Markdown list">
        📝 Copy MD
      </button>
    </div>
    <div class="exporter-footer" id="exporter-status">Ready</div>
  `;

  document.body.appendChild(toolbar);

  const statusEl = document.getElementById('exporter-status');
  function showStatus(msg) {
    statusEl.textContent = msg;
    setTimeout(() => {
      statusEl.textContent = 'Ready';
    }, 2500);
  }

  document.getElementById('btn-copy-toon').addEventListener('click', () => {
    const messages = extractDiscordMessages();
    if (!messages.length) {
      showStatus('❌ No messages found');
      return;
    }
    const toonText = serializeToon(messages, MESSAGE_KEYS);
    navigator.clipboard.writeText(toonText).then(() => {
      showStatus(`✅ Copied ${messages.length} msgs as TOON!`);
    }).catch(err => {
      showStatus('❌ Clipboard error');
    });
  });

  document.getElementById('btn-copy-json').addEventListener('click', () => {
    const messages = extractDiscordMessages();
    if (!messages.length) {
      showStatus('❌ No messages found');
      return;
    }
    const jsonText = JSON.stringify(messages, null, 2);
    navigator.clipboard.writeText(jsonText).then(() => {
      showStatus(`✅ Copied ${messages.length} msgs as JSON!`);
    }).catch(err => {
      showStatus('❌ Clipboard error');
    });
  });

  document.getElementById('btn-copy-markdown').addEventListener('click', () => {
    const messages = extractDiscordMessages();
    if (!messages.length) {
      showStatus('❌ No messages found');
      return;
    }
    const md = messages.map(m => {
      let attachMd = '';
      if (m.attachments && m.attachments.length) {
        attachMd = '\n' + m.attachments.map(att => `![attachment](${att})`).join('\n');
      }
      let replyMd = m.reply_to ? `> Replying to ${m.reply_to}\n` : '';
      return `### [${m.author}](${m.link}) - *${m.time}*\n${replyMd}${m.content}${attachMd}\n`;
    }).join('\n---\n\n');

    navigator.clipboard.writeText(md).then(() => {
      showStatus(`✅ Copied ${messages.length} msgs as Markdown!`);
    }).catch(err => {
      showStatus('❌ Clipboard error');
    });
  });
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract') {
    const messages = extractDiscordMessages(request.options || {});
    const toon = serializeToon(messages, MESSAGE_KEYS);
    sendResponse({ messages, toon, count: messages.length });
  }
  return true;
});

// Auto-inject UI when on Discord chat
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectFloatingToolbar);
} else {
  injectFloatingToolbar();
}
