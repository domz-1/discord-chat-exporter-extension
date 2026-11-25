import '../ui/content.css';

import {
  extractVisibleMessages,
  formatMessagesAsMarkdown,
  toExportableMessage,
} from '../lib/extractor';
import { MutedChannelsController } from '../lib/muted';
import {
  getHideMutedSetting,
  onHideMutedSettingChanged,
  setHideMutedSetting,
} from '../lib/storage';
import { serializeToon } from '../lib/toon';
import {
  EVENT_ARM_FORWARD,
  EVENT_DISARM_FORWARD,
  EVENT_FORWARD_PROGRESS,
  MESSAGE_KEYS,
  type DiscordMessage,
  type ExportFormat,
  type ExtractOptions,
  type ForwardProgressDetail,
} from '../lib/types';
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

    const dock = new LiquidGlassDock();
    const mutedController = new MutedChannelsController(() => scheduleSync());
    const selectionManager = new SelectionManager(() => refreshDock());

    function refreshDock() {
      dock.update({
        selectedCount: selectionManager.getCount(),
        hideMutedChannels: mutedController.isEnabled(),
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

    function scheduleSync() {
      if (syncScheduled) return;
      syncScheduled = true;
      requestAnimationFrame(() => {
        syncScheduled = false;
        selectionManager.decorateVisibleMessages();
        mutedController.scan();
      });
    }

    // Initialize immediately with hideMuted ON (zero flicker), then hydrate saved setting
    mutedController.setEnabled(true);
    void getHideMutedSetting().then((saved) => {
      mutedController.setEnabled(saved);
      refreshDock();
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
    });

    selectionManager.decorateVisibleMessages();
    mutedController.scan();
    refreshDock();

    const bodyObserver = new MutationObserver(() => scheduleSync());
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    const unsubStorage = onHideMutedSettingChanged((enabled) => {
      mutedController.setEnabled(enabled);
      refreshDock();
    });

    const onRuntimeMessage = (
      request: { action?: string; options?: ExtractOptions; enabled?: boolean },
      _sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => {
      if (request.action === 'getState') {
        sendResponse({
          selectedCount: selectionManager.getCount(),
          hideMutedChannels: mutedController.isEnabled(),
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
      unsubStorage();
      window.removeEventListener(EVENT_FORWARD_PROGRESS, onForwardProgress);
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
      dock.unmount();
    });
  },
});
