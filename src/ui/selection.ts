import {
  MESSAGE_SELECTOR,
  computeRangeIds,
  extractSingleMessage,
  getChannelContext,
  parseMessageId,
  sortMessagesChronologically,
} from '../lib/extractor';
import type { DiscordMessage, ForwardTargetRef } from '../lib/types';

export class SelectionManager {
  private selected = new Map<string, DiscordMessage>();
  private lastSelectedId: string | null = null;
  private lastKnownPath = '';
  private onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
  }

  getCount(): number {
    return this.selected.size;
  }

  getSelectedMessages(): DiscordMessage[] {
    return sortMessagesChronologically(Array.from(this.selected.values()));
  }

  getForwardTargets(): ForwardTargetRef[] {
    const fallbackCtx = getChannelContext();
    return this.getSelectedMessages().map((m) => ({
      messageId: m.id,
      channelId: m.channelId || fallbackCtx.channelId,
      guildId: m.guildId || fallbackCtx.guildId,
    }));
  }

  /**
   * Finds the best mounted message DOM element to open Discord's native Forward dialog:
   * prefers the first chronological selected message (for accurate modal preview),
   * then any mounted selected message, then any mounted message in the chat.
   */
  findForwardTriggerElement(): Element | null {
    const ordered = this.getSelectedMessages();
    const visibleEls = Array.from(document.querySelectorAll(MESSAGE_SELECTOR));
    const byId = new Map<string, Element>();
    for (const el of visibleEls) {
      const id = parseMessageId(el.id);
      if (id) byId.set(id, el);
    }

    for (const msg of ordered) {
      const mounted = byId.get(msg.id);
      if (mounted) return mounted;
    }

    return visibleEls[visibleEls.length - 1] || null;
  }

  clear(): void {
    this.selected.clear();
    this.lastSelectedId = null;
    this.syncVisuals();
  }

  syncVisuals(): void {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('dce-has-selection', this.selected.size > 0);

    document.querySelectorAll(MESSAGE_SELECTOR).forEach((el) => {
      const msgId = parseMessageId(el.id);
      if (!msgId) return;
      const isSelected = this.selected.has(msgId);
      el.classList.toggle('dce-selected', isSelected);
      el.classList.toggle('selected-message', isSelected);
      const btn = el.querySelector(':scope > .dce-select-btn');
      if (btn) {
        btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      }
    });

    this.onChange();
  }

  decorateVisibleMessages(): void {
    if (typeof document === 'undefined') return;

    const currentPath = window.location.pathname;
    if (this.lastKnownPath && this.lastKnownPath !== currentPath && this.selected.size > 0) {
      this.selected.clear();
      this.lastSelectedId = null;
      document.body.classList.remove('dce-has-selection');
      this.onChange();
    }
    this.lastKnownPath = currentPath;

    document.querySelectorAll(MESSAGE_SELECTOR).forEach((el) => {
      const msgId = parseMessageId(el.id);
      if (!msgId) return;

      if (!el.classList.contains('dce-msg-item')) {
        el.classList.add('dce-msg-item');
      }

      let btn = el.querySelector<HTMLButtonElement>(':scope > .dce-select-btn');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dce-select-btn';
        btn.title = 'Select message (Shift+Click for range)';
        btn.setAttribute('aria-label', 'Select message for export');
        btn.setAttribute('aria-pressed', 'false');
        btn.innerHTML = `
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3.5 8.5L6.5 11.5L12.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;
        btn.addEventListener('click', (e) => this.handleSelectClick(el, msgId, e));
        el.appendChild(btn);
      }

      const isSelected = this.selected.has(msgId);
      el.classList.toggle('dce-selected', isSelected);
      el.classList.toggle('selected-message', isSelected);
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
  }

  private handleSelectClick(el: Element, msgId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (event.shiftKey && this.lastSelectedId && this.lastSelectedId !== msgId) {
      const visibleEls = Array.from(document.querySelectorAll(MESSAGE_SELECTOR));
      const idToEl = new Map<string, Element>();
      const orderedIds: string[] = [];
      visibleEls.forEach((node) => {
        const id = parseMessageId(node.id);
        if (id) {
          orderedIds.push(id);
          idToEl.set(id, node);
        }
      });

      const rangeIds = computeRangeIds(orderedIds, this.lastSelectedId, msgId);
      const context = getChannelContext();
      rangeIds.forEach((id) => {
        const node = idToEl.get(id);
        if (node) {
          const extracted = extractSingleMessage(node, null, context);
          if (extracted) {
            this.selected.set(id, extracted);
          }
        }
      });
      this.lastSelectedId = msgId;
    } else {
      if (this.selected.has(msgId)) {
        this.selected.delete(msgId);
      } else {
        const extracted = extractSingleMessage(el);
        if (extracted) {
          this.selected.set(msgId, extracted);
        }
      }
      this.lastSelectedId = msgId;
    }

    this.syncVisuals();
  }
}
