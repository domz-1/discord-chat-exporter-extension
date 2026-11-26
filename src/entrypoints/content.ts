import '../ui/content.css';

import { ActivitySidebarController } from '../lib/activity';
import { ArabicRtlController } from '../lib/arabic-rtl';
import {
  extractVisibleMessages,
  formatMessagesAsMarkdown,
  shouldTriggerShortcutCopy,
  toExportableMessage,
} from '../lib/extractor';
import { MutedChannelsController } from '../lib/muted';
import {
  getHideActivitySetting,
  getHideMutedSetting,
  getReactWordSetting,
  getRtlArabicSetting,
  onHideActivitySettingChanged,
  onHideMutedSettingChanged,
  onReactWordSettingChanged,
  onRtlArabicSettingChanged,
  setHideActivitySetting,
  setHideMutedSetting,
  setReactWordSetting,
  setRtlArabicSetting,
} from '../lib/storage';
import { serializeToon } from '../lib/toon';
import {
  EVENT_ARM_FORWARD,
  EVENT_DISARM_FORWARD,
  EVENT_FORWARD_PROGRESS,
  EVENT_WORD_REACT,
  EVENT_WORD_REACT_PROGRESS,
  MESSAGE_KEYS,
  type DiscordMessage,
  type ExportFormat,
  type ExtractOptions,
  type ForwardProgressDetail,
  type WordReactProgressDetail,
} from '../lib/types';
import { DEFAULT_REACT_WORD, wordToReactionEmojis } from '../lib/word-react';
import { LiquidGlassDock } from '../ui/dock';
import { SelectionManager } from '../ui/selection';

export default defineContentScript({
  matches: ['https://discord.com/*'],
  runAt: 'document_idle',

  main(ctx) {
    let syncScheduled = false;
    let activeForwardSessionId: string | null = null;
    let isForwarding = false;
    let modalObserver: MutationObserver | null = null;
    let sawForwardModal = false;
    let reactWord = DEFAULT_REACT_WORD;
    const pendingWordReacts = new Map<string, (ok: boolean) => void>();

    const dock = new LiquidGlassDock();
    const mutedController = new MutedChannelsController(() => scheduleSync());
    const activityController = new ActivitySidebarController();
    const arabicRtlController = new ArabicRtlController();

    function applyReactWord(word: string) {
      reactWord = word;
      selectionManager.setReactWord(reactWord);
      refreshDock();
    }

    function triggerWordReact(
      channelId: string,
      messageId: string,
      wordOverride?: string,
    ): Promise<boolean> {
      const effectiveWord = (wordOverride ?? reactWord).trim();
      if (effectiveWord && effectiveWord !== reactWord) {
        applyReactWord(effectiveWord);
        void setReactWordSetting(effectiveWord);
      }

      const emojis = wordToReactionEmojis(effectiveWord);
      if (!emojis.length) {
        dock.showStatus('Type letters or numbers first', true);
        return Promise.resolve(false);
      }

      const requestId = `dce-react-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      dock.showStatus(`Reacting "${effectiveWord}" (${emojis.length})...`, false, true);

      return new Promise<boolean>((resolve) => {
        pendingWordReacts.set(requestId, resolve);
        window.dispatchEvent(
          new CustomEvent(EVENT_WORD_REACT, {
            detail: { requestId, channelId, messageId, emojis },
          }),
        );
      });
    }

    const selectionManager = new SelectionManager(
      () => refreshDock(),
      async (msg) => {
        const toon = serializeToon([toExportableMessage(msg)], MESSAGE_KEYS);
        try {
          await navigator.clipboard.writeText(toon);
          dock.showStatus('Copied message as TOON');
          return true;
        } catch {
          dock.showStatus('Clipboard error', true);
          return false;
        }
      },
      (channelId, messageId, word) => triggerWordReact(channelId, messageId, word),
    );

    function refreshDock() {
      dock.update({
        selectedCount: selectionManager.getCount(),
        hideMutedChannels: mutedController.isEnabled(),
        hideActivity: activityController.isEnabled(),
        rtlArabic: arabicRtlController.isEnabled(),
        reactWord,
        isForwarding,
      });
    }

    function getMessagesForExport(options: ExtractOptions = {}): {
      messages: DiscordMessage[];
      usedSelected: boolean;
    } {
      const { selectedOnly = false, mode = 'auto', limit = null } = options;
      const hasSelected = selectionManager.getCount() > 0;
      const useSelection =
        mode === 'selected' || selectedOnly === true || (mode === 'auto' && hasSelected);

      if (useSelection) {
        const selected = selectionManager.getSelectedMessages();
        return {
          messages: limit ? selected.slice(0, limit) : selected,
          usedSelected: true,
        };
      }

      return {
        messages: extractVisibleMessages(limit),
        usedSelected: false,
      };
    }

    function copyExport(format: ExportFormat) {
      const { messages, usedSelected } = getMessagesForExport({ mode: 'auto' });
      if (!messages.length) {
        dock.showStatus('No messages found', true);
        return;
      }

      const cleanMessages = messages.map(toExportableMessage);
      let payload = '';
      let label = '';

      if (format === 'toon') {
        payload = serializeToon(cleanMessages, MESSAGE_KEYS);
        label = 'TOON';
      } else if (format === 'json') {
        payload = JSON.stringify(cleanMessages, null, 2);
        label = 'JSON';
      } else {
        payload = formatMessagesAsMarkdown(messages);
        label = 'MD';
      }

      navigator.clipboard
        .writeText(payload)
        .then(() => {
          const scope = usedSelected ? 'selected' : 'visible';
          dock.showStatus(`Copied ${messages.length} ${scope} as ${label}`);
        })
        .catch(() => {
          dock.showStatus('Clipboard error', true);
        });
    }

    function cleanupForwardModalWatch() {
      if (modalObserver) {
        modalObserver.disconnect();
        modalObserver = null;
      }
      document.querySelectorAll('.dce-forward-modal-banner').forEach((el) => el.remove());
      sawForwardModal = false;
    }

    function injectModalBanner(count: number) {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      if (dialog.querySelector('.dce-forward-modal-banner')) return true;

      const banner = document.createElement('div');
      banner.className = 'dce-forward-modal-banner';
      banner.innerHTML = `
        <span class="dce-forward-modal-dot" aria-hidden="true"></span>
        <span>Forwarding ${count} selected message${count === 1 ? '' : 's'} in order</span>
      `;
      dialog.prepend(banner);
      return true;
    }

    async function triggerNativeForward(el: Element): Promise<boolean> {
      // Hover message first in case Discord lazily mounts its hover action bar
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

      const findBtn = () =>
        el.querySelector<HTMLElement>('[aria-label="Forward"], [aria-label*="Forward"]');

      let forwardBtn = findBtn();
      if (!forwardBtn) {
        await new Promise((r) => requestAnimationFrame(r));
        forwardBtn = findBtn();
      }
      if (!forwardBtn) return false;

      forwardBtn.click();
      return true;
    }

    async function startMultiForward() {
      const targets = selectionManager.getForwardTargets();
      if (!targets.length) {
        dock.showStatus('Select messages to forward first', true);
        return;
      }

      const triggerEl = selectionManager.findForwardTriggerElement();
      if (!triggerEl) {
        dock.showStatus('No message visible to open Forward modal', true);
        return;
      }

      cleanupForwardModalWatch();

      const sessionId = `dce-fwd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      activeForwardSessionId = sessionId;
      isForwarding = false;

      // Arm MAIN-world bridge before opening Discord's native Forward dialog
      window.dispatchEvent(
        new CustomEvent(EVENT_ARM_FORWARD, {
          detail: { sessionId, messages: targets },
        }),
      );

      const opened = await triggerNativeForward(triggerEl);
      if (!opened) {
        window.dispatchEvent(new CustomEvent(EVENT_DISARM_FORWARD, { detail: { sessionId } }));
        activeForwardSessionId = null;
        dock.showStatus('Could not open Discord Forward button', true);
        return;
      }

      dock.showStatus(`Pick destination for ${targets.length} msgs`, false, true);

      // Watch Discord's Forward modal to show the Liquid Glass badge and detect cancel
      modalObserver = new MutationObserver(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog) {
          sawForwardModal = true;
          injectModalBanner(targets.length);
        } else if (sawForwardModal) {
          cleanupForwardModalWatch();
          // Give Discord's outgoing Send request a short moment before treating close as cancel
          const closingSession = sessionId;
          setTimeout(() => {
            if (activeForwardSessionId === closingSession && !isForwarding) {
              window.dispatchEvent(
                new CustomEvent(EVENT_DISARM_FORWARD, { detail: { sessionId: closingSession } }),
              );
              activeForwardSessionId = null;
              refreshDock();
            }
          }, 900);
        }
      });

      modalObserver.observe(document.body, { childList: true, subtree: true });
      requestAnimationFrame(() => {
        if (injectModalBanner(targets.length)) {
          sawForwardModal = true;
        }
      });
    }

    // Receive real-time forwarding progress from MAIN-world bridge
    const onForwardProgress = (evt: Event) => {
      const detail = (evt as CustomEvent<ForwardProgressDetail>).detail;
      if (!detail || detail.sessionId !== activeForwardSessionId) return;

      isForwarding = !detail.done;
      refreshDock();

      if (!detail.done) {
        dock.showStatus(`Forwarding ${detail.sent}/${detail.total}...`, false, true);
        return;
      }

      cleanupForwardModalWatch();
      activeForwardSessionId = null;
      isForwarding = false;

      if (detail.failed && detail.failed > 0) {
        dock.showStatus(
          detail.error || `Forwarded ${detail.sent}/${detail.total} (${detail.failed} failed)`,
          true,
        );
      } else {
        selectionManager.clear();
        dock.showStatus(`Forwarded ${detail.sent} message${detail.sent === 1 ? '' : 's'}!`);
      }
      refreshDock();
    };

    window.addEventListener(EVENT_FORWARD_PROGRESS, onForwardProgress);

    const onWordReactProgress = (evt: Event) => {
      const detail = (evt as CustomEvent<WordReactProgressDetail>).detail;
      if (!detail || !pendingWordReacts.has(detail.requestId)) return;

      if (!detail.done) {
        dock.showStatus(`Reacting ${detail.sent}/${detail.total}...`, false, true);
        return;
      }

      const resolve = pendingWordReacts.get(detail.requestId);
      pendingWordReacts.delete(detail.requestId);

      if (detail.error || (detail.failed > 0 && detail.sent === 0)) {
        dock.showStatus(detail.error || 'Could not add reactions', true);
        resolve?.(false);
      } else {
        dock.showStatus(`Reacted "${reactWord.trim()}" (${detail.sent})!`);
        resolve?.(true);
      }
    };

    window.addEventListener(EVENT_WORD_REACT_PROGRESS, onWordReactProgress);

    // Ctrl+C / Cmd+C immediately copies selected messages as TOON (works on Arabic & English layouts)
    const onKeyDown = (e: KeyboardEvent) => {
      const selectedText = window.getSelection()?.toString().trim() || '';
      const activeEl = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
      const hasInputSelection =
        activeEl &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') &&
        typeof activeEl.selectionStart === 'number' &&
        typeof activeEl.selectionEnd === 'number' &&
        activeEl.selectionEnd > activeEl.selectionStart;

      if (
        shouldTriggerShortcutCopy({
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          key: e.key,
          code: e.code,
          selectedCount: selectionManager.getCount(),
          hasTextSelection: selectedText.length > 0 || Boolean(hasInputSelection),
        })
      ) {
        e.preventDefault();
        e.stopPropagation();
        copyExport('toon');
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    function scheduleSync() {
      if (syncScheduled) return;
      syncScheduled = true;
      requestAnimationFrame(() => {
        syncScheduled = false;
        selectionManager.decorateVisibleMessages();
        mutedController.scan();
        activityController.scan();
        arabicRtlController.scan();
      });
    }

    // Initialize immediately with defaults ON (zero flicker), then hydrate saved settings
    mutedController.setEnabled(true);
    activityController.setEnabled(true);
    arabicRtlController.setEnabled(true);

    void getHideMutedSetting().then((saved) => {
      mutedController.setEnabled(saved);
      refreshDock();
    });
    void getHideActivitySetting().then((saved) => {
      activityController.setEnabled(saved);
      refreshDock();
    });
    void getRtlArabicSetting().then((saved) => {
      arabicRtlController.setEnabled(saved);
      refreshDock();
    });
    void getReactWordSetting().then((savedWord) => {
      applyReactWord(savedWord);
    });

    dock.mount({
      onCopy: (fmt) => copyExport(fmt),
      onForward: () => void startMultiForward(),
      onClear: () => {
        selectionManager.clear();
        dock.showStatus('Selection cleared');
      },
      onToggleMuted: (enabled) => {
        mutedController.setEnabled(enabled);
        void setHideMutedSetting(enabled);
        refreshDock();
        dock.showStatus(enabled ? 'Muted channels hidden' : 'Muted channels shown');
      },
      onToggleActivity: (enabled) => {
        activityController.setEnabled(enabled);
        void setHideActivitySetting(enabled);
        refreshDock();
        dock.showStatus(enabled ? 'Activity sidebar hidden' : 'Activity sidebar shown');
      },
      onToggleRtlArabic: (enabled) => {
        arabicRtlController.setEnabled(enabled);
        void setRtlArabicSetting(enabled);
        refreshDock();
        dock.showStatus(enabled ? 'Arabic RTL enabled' : 'Arabic RTL disabled');
      },
      onReactWordChange: (word) => {
        reactWord = word;
        selectionManager.setReactWord(word);
        void setReactWordSetting(word);
      },
    });

    selectionManager.decorateVisibleMessages();
    mutedController.scan();
    activityController.scan();
    arabicRtlController.scan();
    refreshDock();

    const bodyObserver = new MutationObserver(() => scheduleSync());
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    const unsubStorage = onHideMutedSettingChanged((enabled) => {
      mutedController.setEnabled(enabled);
      refreshDock();
    });
    const unsubActivity = onHideActivitySettingChanged((enabled) => {
      activityController.setEnabled(enabled);
      refreshDock();
    });
    const unsubRtl = onRtlArabicSettingChanged((enabled) => {
      arabicRtlController.setEnabled(enabled);
      refreshDock();
    });
    const unsubReactWord = onReactWordSettingChanged((word) => {
      applyReactWord(word);
    });

    const onRuntimeMessage = (
      request: { action?: string; options?: ExtractOptions; enabled?: boolean; word?: string },
      _sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => {
      if (request.action === 'getState') {
        sendResponse({
          selectedCount: selectionManager.getCount(),
          hideMutedChannels: mutedController.isEnabled(),
          hideActivity: activityController.isEnabled(),
          rtlArabic: arabicRtlController.isEnabled(),
          reactWord,
        });
      } else if (request.action === 'extract') {
        const { messages, usedSelected } = getMessagesForExport(request.options || {});
        const cleanMessages = messages.map(toExportableMessage);
        const toon = serializeToon(cleanMessages, MESSAGE_KEYS);
        const markdown = formatMessagesAsMarkdown(messages);
        sendResponse({
          messages: cleanMessages,
          toon,
          markdown,
          count: cleanMessages.length,
          usedSelected,
          selectedCount: selectionManager.getCount(),
        });
      } else if (request.action === 'clearSelection') {
        selectionManager.clear();
        sendResponse({ selectedCount: 0 });
      } else if (request.action === 'setHideMuted') {
        const enabled = Boolean(request.enabled);
        mutedController.setEnabled(enabled);
        void setHideMutedSetting(enabled);
        refreshDock();
        sendResponse({ hideMutedChannels: mutedController.isEnabled() });
      } else if (request.action === 'setHideActivity') {
        const enabled = Boolean(request.enabled);
        activityController.setEnabled(enabled);
        void setHideActivitySetting(enabled);
        refreshDock();
        sendResponse({ hideActivity: activityController.isEnabled() });
      } else if (request.action === 'setRtlArabic') {
        const enabled = Boolean(request.enabled);
        arabicRtlController.setEnabled(enabled);
        void setRtlArabicSetting(enabled);
        refreshDock();
        sendResponse({ rtlArabic: arabicRtlController.isEnabled() });
      } else if (request.action === 'setReactWord') {
        const nextWord = typeof request.word === 'string' ? request.word : DEFAULT_REACT_WORD;
        applyReactWord(nextWord);
        void setReactWordSetting(nextWord);
        sendResponse({ reactWord });
      } else if (request.action === 'forwardSelected') {
        void startMultiForward();
        sendResponse({ started: true, count: selectionManager.getCount() });
      }
      return true;
    };

    browser.runtime.onMessage.addListener(onRuntimeMessage);

    ctx.onInvalidated(() => {
      bodyObserver.disconnect();
      mutedController.disconnect();
      cleanupForwardModalWatch();
      selectionManager.closeReactPopover();
      unsubStorage();
      unsubActivity();
      unsubRtl();
      unsubReactWord();
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener(EVENT_FORWARD_PROGRESS, onForwardProgress);
      window.removeEventListener(EVENT_WORD_REACT_PROGRESS, onWordReactProgress);
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
      dock.unmount();
    });
  },
});
