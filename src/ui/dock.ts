import type { ExportFormat } from '../lib/types';

export interface DockCallbacks {
  onCopy: (format: ExportFormat) => void;
  onForward: () => void;
  onClear: () => void;
  onToggleMuted: (enabled: boolean) => void;
}

export interface DockViewState {
  selectedCount: number;
  hideMutedChannels: boolean;
  isForwarding?: boolean;
}

export class LiquidGlassDock {
  private root: HTMLDivElement | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;
  private hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private lastState: DockViewState = { selectedCount: 0, hideMutedChannels: true };

  mount(callbacks: DockCallbacks): void {
    if (document.getElementById('discord-exporter-dock')) {
      this.root = document.getElementById('discord-exporter-dock') as HTMLDivElement;
      return;
    }

    const dock = document.createElement('div');
    dock.id = 'discord-exporter-dock';
    dock.className = 'dce-dock';
    dock.innerHTML = `
      <div class="dce-panel" role="region" aria-label="Discord Exporter">
        <div class="dce-header">
          <div class="dce-brand">
            <span class="dce-orb-mini" aria-hidden="true"></span>
            <span class="dce-title">Exporter</span>
          </div>
          <div class="dce-header-right">
            <span class="dce-pill" id="dce-selection-badge">All visible</span>
            <button type="button" class="dce-clear-btn" id="btn-clear-selection" title="Clear selected messages" hidden>
              Clear
            </button>
          </div>
        </div>

        <div class="dce-actions">
          <button type="button" class="dce-btn dce-btn-forward" id="btn-forward-selected" title="Select messages to forward together via Discord's native Forward modal" disabled>
            <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M11 3.75L15.75 8.5L11 13.25" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M15.5 8.5H7.25C4.5 8.5 2.5 10.5 2.5 13.25V14.25" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span id="dce-forward-label">Forward Selected</span>
            <span class="dce-btn-tag" id="dce-forward-count" hidden>0</span>
          </button>

          <button type="button" class="dce-btn dce-btn-primary" id="btn-copy-toon" title="Copy as compact TOON for LLMs">
            <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M9 2.25L15 5.625L9 9L3 5.625L9 2.25Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
              <path d="M3 9L9 12.375L15 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M3 12.375L9 15.75L15 12.375" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Copy TOON</span>
            <span class="dce-btn-tag">LLM</span>
          </button>

          <div class="dce-actions-row">
            <button type="button" class="dce-btn" id="btn-copy-json" title="Copy structured JSON">
              <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M6.5 3.5C5 3.5 4.5 4.25 4.5 5.5V7C4.5 8 3.75 9 3 9C3.75 9 4.5 10 4.5 11V12.5C4.5 13.75 5 14.5 6.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M11.5 3.5C13 3.5 13.5 4.25 13.5 5.5V7C13.5 8 14.25 9 15 9C14.25 9 13.5 10 13.5 11V12.5C13.5 13.75 13 14.5 11.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span>JSON</span>
            </button>

            <button type="button" class="dce-btn" id="btn-copy-markdown" title="Copy clean Markdown">
              <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <rect x="2.5" y="4" width="13" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/>
                <path d="M5.25 11.25V6.75L7.5 9.25L9.75 6.75V11.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12.5 6.75V11.25M12.5 11.25L11.25 10M12.5 11.25L13.75 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>MD</span>
            </button>
          </div>
        </div>

        <label class="dce-toggle-row" for="dce-toggle-muted">
          <span class="dce-toggle-label">
            <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M2.5 2.5L15.5 15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M7.5 4.2A6.5 6.5 0 0 1 15.75 9a6.8 6.8 0 0 1-1.9 2.65M11.1 11.1A2.75 2.75 0 0 1 6.9 6.9M4.4 6.1A6.8 6.8 0 0 0 2.25 9a6.5 6.5 0 0 0 8.2 4.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            Hide muted channels
          </span>
          <span class="dce-switch">
            <input type="checkbox" id="dce-toggle-muted" checked />
            <span class="dce-switch-track"></span>
          </span>
        </label>

        <div class="dce-footer" id="exporter-status">Hover msgs to select · Shift+Click range</div>
      </div>

      <div class="dce-dot-hit" aria-label="Hover to open Discord Exporter">
        <div class="dce-dot">
          <span class="dce-dot-count" id="dce-dot-count">0</span>
        </div>
      </div>
    `;

    document.body.appendChild(dock);
    this.root = dock;

    const openDock = () => {
      if (this.hoverCloseTimer) {
        clearTimeout(this.hoverCloseTimer);
        this.hoverCloseTimer = null;
      }
      dock.classList.add('dce-open');
    };

    const scheduleCloseDock = () => {
      if (this.hoverCloseTimer) clearTimeout(this.hoverCloseTimer);
      this.hoverCloseTimer = setTimeout(() => {
        dock.classList.remove('dce-open');
      }, 220);
    };

    dock.addEventListener('mouseenter', openDock);
    dock.addEventListener('mouseleave', scheduleCloseDock);

    dock.querySelector('#btn-copy-toon')?.addEventListener('click', () => callbacks.onCopy('toon'));
    dock.querySelector('#btn-copy-json')?.addEventListener('click', () => callbacks.onCopy('json'));
    dock.querySelector('#btn-copy-markdown')?.addEventListener('click', () => callbacks.onCopy('markdown'));
    dock.querySelector('#btn-forward-selected')?.addEventListener('click', () => callbacks.onForward());
    dock.querySelector('#btn-clear-selection')?.addEventListener('click', () => callbacks.onClear());
    dock.querySelector('#dce-toggle-muted')?.addEventListener('change', (e) => {
      callbacks.onToggleMuted((e.target as HTMLInputElement).checked);
    });
  }

  update(state: DockViewState): void {
    this.lastState = state;
    if (!this.root) return;

    const { selectedCount, hideMutedChannels, isForwarding } = state;
    this.root.classList.toggle('dce-has-count', selectedCount > 0);

    const dotCount = this.root.querySelector<HTMLElement>('#dce-dot-count');
    if (dotCount) {
      dotCount.textContent = selectedCount > 99 ? '99+' : String(selectedCount);
    }

    const badge = this.root.querySelector<HTMLElement>('#dce-selection-badge');
    if (badge) {
      badge.textContent = selectedCount > 0 ? `${selectedCount} selected` : 'All visible';
      badge.classList.toggle('dce-badge-active', selectedCount > 0);
    }

    const clearBtn = this.root.querySelector<HTMLButtonElement>('#btn-clear-selection');
    if (clearBtn) {
      clearBtn.hidden = selectedCount === 0;
    }

    const forwardBtn = this.root.querySelector<HTMLButtonElement>('#btn-forward-selected');
    const forwardLabel = this.root.querySelector<HTMLElement>('#dce-forward-label');
    const forwardCount = this.root.querySelector<HTMLElement>('#dce-forward-count');
    if (forwardBtn && forwardLabel && forwardCount) {
      forwardBtn.disabled = selectedCount === 0 || Boolean(isForwarding);
      forwardBtn.classList.toggle('dce-btn-forward-ready', selectedCount > 0 && !isForwarding);
      forwardLabel.textContent = isForwarding ? 'Forwarding...' : 'Forward Selected';
      forwardCount.hidden = selectedCount === 0;
      forwardCount.textContent = String(selectedCount);
    }

    const mutedToggle = this.root.querySelector<HTMLInputElement>('#dce-toggle-muted');
    if (mutedToggle) {
      mutedToggle.checked = hideMutedChannels;
    }

    const statusEl = this.root.querySelector<HTMLElement>('#exporter-status');
    if (
      statusEl &&
      !statusEl.classList.contains('dce-status-ok') &&
      !statusEl.classList.contains('dce-status-error')
    ) {
      statusEl.textContent =
        selectedCount > 0
          ? `${selectedCount} selected · Copy or Forward`
          : 'Hover msgs to select · Shift+Click range';
    }
  }

  showStatus(msg: string, isError = false, persist = false): void {
    const statusEl = this.root?.querySelector<HTMLElement>('#exporter-status');
    if (!statusEl) return;

    statusEl.textContent = msg;
    statusEl.classList.toggle('dce-status-error', isError);
    statusEl.classList.toggle('dce-status-ok', !isError);

    if (this.statusTimer) clearTimeout(this.statusTimer);
    if (!persist) {
      this.statusTimer = setTimeout(() => {
        statusEl.classList.remove('dce-status-error', 'dce-status-ok');
        this.update(this.lastState);
      }, 2800);
    }
  }

  unmount(): void {
    if (this.statusTimer) clearTimeout(this.statusTimer);
    if (this.hoverCloseTimer) clearTimeout(this.hoverCloseTimer);
    this.root?.remove();
    this.root = null;
  }
}
