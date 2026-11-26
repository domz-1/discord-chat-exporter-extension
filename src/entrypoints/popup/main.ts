import {
  getHideActivitySetting,
  getHideMutedSetting,
  getReactWordSetting,
  getRtlArabicSetting,
  setHideActivitySetting,
  setHideMutedSetting,
  setReactWordSetting,
  setRtlArabicSetting,
} from '../../lib/storage';
import type { ExtensionStateResponse, ExtractResponse } from '../../lib/types';
import { wordToReactionEmojis } from '../../lib/word-react';

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

function updateWordPreview(word: string) {
  const preview = document.getElementById('pop-word-preview');
  if (!preview) return;
  const emojis = wordToReactionEmojis(word);
  preview.textContent = emojis.length ? emojis.join(' ') : '—';
}

async function initPopup() {
  const toggleEl = document.getElementById('pop-toggle-muted') as HTMLInputElement | null;
  const activityToggleEl = document.getElementById('pop-toggle-activity') as HTMLInputElement | null;
  const rtlToggleEl = document.getElementById('pop-toggle-rtl') as HTMLInputElement | null;
  const wordInput = document.getElementById('pop-react-word') as HTMLInputElement | null;

  const [savedMuted, savedActivity, savedRtl, savedWord] = await Promise.all([
    getHideMutedSetting(),
    getHideActivitySetting(),
    getRtlArabicSetting(),
    getReactWordSetting(),
  ]);
  if (toggleEl) toggleEl.checked = savedMuted;
  if (activityToggleEl) activityToggleEl.checked = savedActivity;
  if (rtlToggleEl) rtlToggleEl.checked = savedRtl;
  if (wordInput) {
    wordInput.value = savedWord;
    updateWordPreview(savedWord);
  }

  const state = await sendToDiscord<ExtensionStateResponse>({ action: 'getState' }, true);
  if (state) {
    updateSelectionUI(state.selectedCount || 0);
    if (toggleEl && typeof state.hideMutedChannels === 'boolean') {
      toggleEl.checked = state.hideMutedChannels;
    }
    if (activityToggleEl && typeof state.hideActivity === 'boolean') {
      activityToggleEl.checked = state.hideActivity;
    }
    if (rtlToggleEl && typeof state.rtlArabic === 'boolean') {
      rtlToggleEl.checked = state.rtlArabic;
    }
    if (wordInput && typeof state.reactWord === 'string') {
      wordInput.value = state.reactWord;
      updateWordPreview(state.reactWord);
    }
  }

  wordInput?.addEventListener('input', () => {
    const word = wordInput.value;
    updateWordPreview(word);
    void setReactWordSetting(word);
    void sendToDiscord({ action: 'setReactWord', word }, true);
  });

  toggleEl?.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    await setHideMutedSetting(enabled);
    await sendToDiscord({ action: 'setHideMuted', enabled }, true);
    setStatus(enabled ? 'Muted channels hidden' : 'Muted channels shown');
  });

  activityToggleEl?.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    await setHideActivitySetting(enabled);
    await sendToDiscord({ action: 'setHideActivity', enabled }, true);
    setStatus(enabled ? 'Activity sidebar hidden' : 'Activity sidebar shown');
  });

  rtlToggleEl?.addEventListener('change', async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    await setRtlArabicSetting(enabled);
    await sendToDiscord({ action: 'setRtlArabic', enabled }, true);
    setStatus(enabled ? 'Arabic RTL enabled' : 'Arabic RTL disabled');
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
