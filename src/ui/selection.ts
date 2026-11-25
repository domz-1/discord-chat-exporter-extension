import {
  MESSAGE_SELECTOR,
  computeRangeIds,
  extractSingleMessage,
  getChannelContext,
  parseMessageId,
  parseMessageMeta,
  sortMessagesChronologically,
} from '../lib/extractor';
import type { DiscordMessage, ForwardTargetRef } from '../lib/types';
import { DEFAULT_REACT_WORD, wordToReactionEmojis } from '../lib/word-react';

const COPY_ICON_SVG = `
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <rect x="6" y="6" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.5"/>
    <path d="M12 6V4.5C12 3.67 11.33 3 10.5 3H4.5C3.67 3 3 3.67 3 4.5V10.5C3 11.33 3.67 12 4.5 12H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>
`;

const REACT_ICON_SVG = `
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M4.25 14L8.25 4.25L12.25 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5.6 10.9H10.9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M14.5 2.5V6M12.75 4.25H16.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>
`;

const COPIED_ICON_SVG = `
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M4 9.5L7.25 12.75L14 5.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

export class SelectionManager {
  private selected = new Map<string, DiscordMessage>();
  private lastSelectedId: string | null = null;
  private lastKnownPath = '';
  private reactWord = DEFAULT_REACT_WORD;
  private onChange: () => void;
  private onQuickCopy?: (msg: DiscordMessage) => Promise<boolean>;
  private onWordReact?: (channelId: string, messageId: string, word: string) => Promise<boolean>;
  private activePopover: HTMLDivElement | null = null;
  private popoverOutsideHandler: ((e: MouseEvent) => void) | null = null;

  constructor(
    onChange: () => void,
    onQuickCopy?: (msg: DiscordMessage) => Promise<boolean>,
    onWordReact?: (channelId: string, messageId: string, word: string) => Promise<boolean>,
  ) {
    this.onChange = onChange;
    this.onQuickCopy = onQuickCopy;
    this.onWordReact = onWordReact;
  }

  setReactWord(word: string): void {
    this.reactWord = word;
    const tooltip = this.getReactTooltip();
    document.querySelectorAll<HTMLButtonElement>('.dce-msg-react-btn').forEach((btn) => {
      btn.title = tooltip;
      btn.setAttribute('aria-label', tooltip);
    });
  }

  closeReactPopover(): void {
    if (this.popoverOutsideHandler) {
      document.removeEventListener('mousedown', this.popoverOutsideHandler, true);
      this.popoverOutsideHandler = null;
    }
    this.activePopover?.remove();
    this.activePopover = null;
  }

  private getReactTooltip(): string {
    const emojis = wordToReactionEmojis(this.reactWord);
    const preview = emojis.length ? ` (${emojis.join(' ')})` : '';
    return `Word React · Click to type · Shift+Click for "${this.reactWord.trim() || DEFAULT_REACT_WORD}"${preview}`;
  }

  private fireWordReact(
    reactBtn: HTMLButtonElement,
    channelId: string,
    messageId: string,
    word: string,
  ): void {
    if (!this.onWordReact || reactBtn.classList.contains('dce-reacting')) return;
    reactBtn.classList.add('dce-reacting');
    void this.onWordReact(channelId, messageId, word).then((ok) => {
      reactBtn.classList.remove('dce-reacting');
      if (!ok) return;
      reactBtn.classList.add('dce-copied');
      reactBtn.innerHTML = COPIED_ICON_SVG;
      setTimeout(() => {
        reactBtn.classList.remove('dce-copied');
        reactBtn.innerHTML = REACT_ICON_SVG;
      }, 1500);
    });
  }

  private openReactPopover(
    anchorBtn: HTMLButtonElement,
    channelId: string,
    messageId: string,
  ): void {
    this.closeReactPopover();

    const pop = document.createElement('div');
    pop.id = 'dce-react-popover';
    pop.className = 'dce-react-popover';
    pop.innerHTML = `
      <div class="dce-rp-top">
        <span class="dce-rp-title">Word React</span>
        <span class="dce-rp-preview" id="dce-rp-preview"></span>
      </div>
      <div class="dce-rp-row">
        <input
          type="text"
          class="dce-rp-input"
          id="dce-rp-input"
          maxlength="24"
          placeholder="Type letters or numbers..."
          autocomplete="off"
          spellcheck="false"
        />
        <button type="button" class="dce-rp-go" id="dce-rp-go">React</button>
      </div>
      <div class="dce-rp-hint">Enter to send · Esc to close</div>
    `;

    document.body.appendChild(pop);
    this.activePopover = pop;

    const rect = anchorBtn.getBoundingClientRect();
    const popWidth = 264;
    const popHeight = 104;
    const left = Math.max(12, Math.min(rect.right - popWidth, window.innerWidth - popWidth - 12));
    const top = rect.top - popHeight - 8 > 12 ? rect.top - popHeight - 8 : rect.bottom + 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    const input = pop.querySelector<HTMLInputElement>('#dce-rp-input')!;
    const preview = pop.querySelector<HTMLElement>('#dce-rp-preview')!;
    const goBtn = pop.querySelector<HTMLButtonElement>('#dce-rp-go')!;

    const syncPreview = () => {
      const emojis = wordToReactionEmojis(input.value);
      preview.textContent = emojis.length ? emojis.join(' ') : '—';
      goBtn.disabled = emojis.length === 0;
    };

    const submit = () => {
      const word = input.value.trim();
      if (!wordToReactionEmojis(word).length) return;
      this.closeReactPopover();
      this.fireWordReact(anchorBtn, channelId, messageId, word);
    };

    input.value = this.reactWord;
    syncPreview();

    ['keydown', 'keypress', 'keyup'].forEach((evtName) => {
      input.addEventListener(evtName, (e) => {
        e.stopPropagation();
        if (evtName === 'keydown') {
          const ke = e as KeyboardEvent;
          if (ke.key === 'Enter') {
            ke.preventDefault();
            submit();
          } else if (ke.key === 'Escape') {
            ke.preventDefault();
            this.closeReactPopover();
          }
        }
      });
    });

    input.addEventListener('input', syncPreview);
    goBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      submit();
    });

    pop.addEventListener('mousedown', (e) => e.stopPropagation());
    pop.addEventListener('click', (e) => e.stopPropagation());

    this.popoverOutsideHandler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target && !pop.contains(target) && target !== anchorBtn && !anchorBtn.contains(target)) {
        this.closeReactPopover();
      }
    };
    document.addEventListener('mousedown', this.popoverOutsideHandler, true);

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
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

      // Inject 1-click quick Copy & Word React buttons into Discord's message hover toolbar
      const hoverInner = el.querySelector('[class*="buttonsInner_"]');
      if (hoverInner) {
        if (this.onQuickCopy && !hoverInner.querySelector('.dce-msg-copy-btn')) {
          const copyBtn = document.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'dce-msg-copy-btn';
          copyBtn.title = 'Copy message (TOON)';
          copyBtn.setAttribute('aria-label', 'Copy message as TOON');
          copyBtn.innerHTML = COPY_ICON_SVG;
          copyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const extracted = extractSingleMessage(el);
            if (!extracted || !this.onQuickCopy) return;
            void this.onQuickCopy(extracted).then((ok) => {
              if (!ok) return;
              copyBtn.classList.add('dce-copied');
              copyBtn.innerHTML = COPIED_ICON_SVG;
              setTimeout(() => {
                copyBtn.classList.remove('dce-copied');
                copyBtn.innerHTML = COPY_ICON_SVG;
              }, 1400);
            });
          });
          hoverInner.appendChild(copyBtn);
        }

        if (this.onWordReact && !hoverInner.querySelector('.dce-msg-react-btn')) {
          const reactBtn = document.createElement('button');
          reactBtn.type = 'button';
          reactBtn.className = 'dce-msg-react-btn';
          const tooltip = this.getReactTooltip();
          reactBtn.title = tooltip;
          reactBtn.setAttribute('aria-label', tooltip);
          reactBtn.innerHTML = REACT_ICON_SVG;
          reactBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!this.onWordReact || reactBtn.classList.contains('dce-reacting')) return;
            const meta = parseMessageMeta(el.id);
            const effectiveChannelId = meta.channelId || getChannelContext().channelId;
            if (!effectiveChannelId || !meta.messageId) return;

            if (e.shiftKey) {
              this.fireWordReact(reactBtn, effectiveChannelId, meta.messageId, this.reactWord);
            } else {
              this.openReactPopover(reactBtn, effectiveChannelId, meta.messageId);
            }
          });
          hoverInner.appendChild(reactBtn);
        }
      }
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
