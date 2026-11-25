import { getHideMutedSetting, setHideMutedSetting } from '../../lib/storage';
import type { ExtensionStateResponse, ExtractResponse } from '../../lib/types';

let statusTimeout: ReturnType<typeof setTimeout> | null = null;

function setStatus(text: string, isError = false) {
  const el = document.getElementById('pop-status');
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? '#fca5a5' : '#86efac';
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    el.textContent = 'Ready';
    el.style.color = 'rgba(255, 255, 255, 0.6)';
  }, 2600);
}

function updateSelectionUI(count: number) {
  const badge = document.getElementById('pop-selection-badge');
  const clearBtn = document.getElementById('pop-clear') as HTMLButtonElement | null;
  const forwardBtn = document.getElementById('pop-forward') as HTMLButtonElement | null;
  const forwardCount = document.getElementById('pop-forward-count');

  if (badge) {
    badge.textContent = count > 0 ? `${count} selected` : 'All visible';
    badge.classList.toggle('active', count > 0);
  }
  if (clearBtn) {
    clearBtn.hidden = count === 0;
  }
  if (forwardBtn) {
    forwardBtn.disabled = count === 0;
    forwardBtn.classList.toggle('ready', count > 0);
  }
  if (forwardCount) {
    forwardCount.hidden = count === 0;
    forwardCount.textContent = String(count);
  }
}

async function getActiveDiscordTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus('Active tab not found', true);
    return null;
  }
  if (!tab.url?.includes('discord.com')) {
    setStatus('Open Discord Web to export', true);
    return null;
  }
  return tab;
}

async function sendToDiscord<T>(
  message: Record<string, unknown>,
  silent = false,
): Promise<T | null> {
  const tab = await getActiveDiscordTab();
  if (!tab?.id) return null;

  try {
    const response = (await browser.tabs.sendMessage(tab.id, message)) as T | undefined;
    if (!response) {
      if (!silent) setStatus('Refresh Discord page first', true);
      return null;
    }
    return response;
  } catch {
    if (!silent) setStatus('Refresh Discord page first', true);
    return null;
  }
}

async function initPopup() {
  const toggleEl = document.getElementById('pop-toggle-muted') as HTMLInputElement | null;

  const savedMuted = await getHideMutedSetting();
  if (toggleEl) toggleEl.checked = savedMuted;

  const state = await sendToDiscord<ExtensionStateResponse>({ action: 'getState' }, true);
  if (state) {
    updateSelectionUI(state.selectedCount || 0);
    if (toggleEl && typeof state.hideMutedChannels === 'boolean') {
      toggleEl.checked = state.hideMutedChannels;
    }
  }

  toggleEl?.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    await setHideMutedSetting(enabled);
    await sendToDiscord({ action: 'setHideMuted', enabled }, true);
    setStatus(enabled ? 'Muted channels hidden' : 'Muted channels shown');
  });

  document.getElementById('pop-clear')?.addEventListener('click', async () => {
    const res = await sendToDiscord<{ selectedCount: number }>({ action: 'clearSelection' });
    if (res) {
      updateSelectionUI(0);
      setStatus('Selection cleared');
    }
  });

  document.getElementById('pop-forward')?.addEventListener('click', async () => {
    const res = await sendToDiscord<{ started: boolean; count: number }>({
      action: 'forwardSelected',
    });
    if (res?.started) {
      window.close();
    }
  });

  document.getElementById('pop-copy-toon')?.addEventListener('click', async () => {
    const res = await sendToDiscord<ExtractResponse>({
      action: 'extract',
      options: { mode: 'auto' },
    });
    if (!res) return;
    if (!res.count) {
      setStatus('No messages found', true);
      return;
    }
    await navigator.clipboard.writeText(res.toon);
    setStatus(`Copied ${res.count} ${res.usedSelected ? 'selected' : 'visible'} as TOON`);
  });

  document.getElementById('pop-copy-json')?.addEventListener('click', async () => {
    const res = await sendToDiscord<ExtractResponse>({
      action: 'extract',
      options: { mode: 'auto' },
    });
    if (!res) return;
    if (!res.count) {
      setStatus('No messages found', true);
      return;
    }
    await navigator.clipboard.writeText(JSON.stringify(res.messages, null, 2));
    setStatus(`Copied ${res.count} ${res.usedSelected ? 'selected' : 'visible'} as JSON`);
  });

  document.getElementById('pop-copy-md')?.addEventListener('click', async () => {
    const res = await sendToDiscord<ExtractResponse>({
      action: 'extract',
      options: { mode: 'auto' },
    });
    if (!res) return;
    if (!res.count) {
      setStatus('No messages found', true);
      return;
    }
    await navigator.clipboard.writeText(res.markdown);
    setStatus(`Copied ${res.count} ${res.usedSelected ? 'selected' : 'visible'} as Markdown`);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  void initPopup();
});
